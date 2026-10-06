import type { Application } from 'pixi.js';
import { IS_APP } from '../config/platform';
import { safeArea } from '../design/layout';

// A small flight recorder for the "touches go wrong after unlocking the phone" bug: the
// sizes iOS reports around every lock and unlock, and where each touch lands on the glass
// and in the game. It keeps the last few hundred lines in local storage, and in the app
// also in the app's own preferences, where it can be read off a connected phone with
// `xcrun devicectl device copy from ... --domain-type appDataContainer`.

const MAX_LINES = 400;
const KEY = 'chowa.debug';
const lines: string[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let appRef: Application | null = null;
const started = Date.now();

export function flush(): void {
  flushTimer = null;
  const text = lines.join('\n');
  try {
    localStorage.setItem(KEY, text);
  } catch {
    // ignore
  }
  if (IS_APP) void import('@capacitor/preferences').then(({ Preferences }) => Preferences.set({ key: KEY, value: text })).catch(() => undefined);
}

export function dlog(kind: string, data: Record<string, unknown> = {}): void {
  const t = ((Date.now() - started) / 1000).toFixed(2);
  lines.push(`${t} ${kind} ${JSON.stringify(data)}`);
  if (lines.length > MAX_LINES) lines.splice(0, lines.length - MAX_LINES);
  flushTimer ??= setTimeout(flush, 800);
}

export function sizes(): Record<string, unknown> {
  const app = appRef;
  const vv = window.visualViewport;
  const rect = app?.canvas.getBoundingClientRect();
  return {
    inner: [window.innerWidth, window.innerHeight],
    vv: vv ? [Math.round(vv.width), Math.round(vv.height), Math.round(vv.offsetTop), vv.scale] : null,
    screen: [screen.width, screen.height],
    renderer: app ? [app.screen.width, app.screen.height, app.renderer.resolution] : null,
    canvasCss: rect ? [Math.round(rect.left), Math.round(rect.top), Math.round(rect.width), Math.round(rect.height)] : null,
    canvasPx: app ? [app.canvas.width, app.canvas.height] : null,
    dpr: window.devicePixelRatio,
    scroll: [window.scrollX, window.scrollY],
    safe: { ...safeArea },
  };
}

export function installDebugLog(app: Application, sceneName: () => string): void {
  appRef = app;
  // Keep what earlier launches recorded: the game may reload itself (after iOS drops its
  // graphics), and that reload is exactly what we need to see.
  try {
    const before = localStorage.getItem(KEY);
    if (before) lines.push(...before.split('\n').slice(-200), '--- new launch ---');
  } catch {
    // ignore
  }
  dlog('start', { ...sizes(), visibility: document.visibilityState });
  document.addEventListener('visibilitychange', () => dlog(document.hidden ? 'hidden' : 'visible', sizes()));
  window.addEventListener('resize', () => dlog('window-resize', sizes()));
  window.visualViewport?.addEventListener('resize', () => dlog('viewport-resize', sizes()));
  window.addEventListener('orientationchange', () => dlog('orientation', sizes()));
  window.addEventListener('pageshow', (e) => dlog('pageshow', { persisted: (e as PageTransitionEvent).persisted }));
  window.addEventListener('pagehide', () => dlog('pagehide'));
  window.addEventListener('focus', () => dlog('focus'));
  window.addEventListener('blur', () => dlog('blur'));
  app.renderer.on('resize', () => dlog('renderer-resize', sizes()));
  app.canvas.addEventListener('webglcontextlost', () => dlog('webgl-lost'));
  app.canvas.addEventListener('webglcontextrestored', () => dlog('webgl-restored'));
  // Every touch: where it is on the glass, and where the game thinks it is.
  const point = { x: 0, y: 0 };
  window.addEventListener(
    'pointerdown',
    (e) => {
      app.renderer.events.mapPositionToPoint(point as never, e.clientX, e.clientY);
      dlog('down', { glass: [Math.round(e.clientX), Math.round(e.clientY)], game: [Math.round(point.x), Math.round(point.y)], type: e.pointerType, id: e.pointerId, scene: sceneName(), renderer: [app.screen.width, app.screen.height] });
    },
    { capture: true },
  );
  // How many movement signals each touch brings, native and as the game sees them.
  const moves = new Map<number, number>();
  window.addEventListener('pointermove', (e) => moves.set(e.pointerId, (moves.get(e.pointerId) ?? 0) + 1), { capture: true });
  window.addEventListener(
    'pointerup',
    (e) => {
      dlog('up', { id: e.pointerId, nativeMoves: moves.get(e.pointerId) ?? 0 });
      moves.delete(e.pointerId);
    },
    { capture: true },
  );
  window.addEventListener('pointercancel', (e) => dlog('cancel', { id: e.pointerId }), { capture: true });
  // Any error that escapes, with where it came from: the unlock bug was one of these.
  window.addEventListener('error', (e) => dlog('error', { message: e.message, at: `${e.filename?.split('/').pop()}:${e.lineno}` }));
  window.addEventListener('unhandledrejection', (e) => dlog('rejection', { message: String((e.reason as Error)?.message ?? e.reason) }));
}
