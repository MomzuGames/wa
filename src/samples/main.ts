import '@fontsource/quicksand/300.css';
import { cssHex } from '../design/palette';
import levelsJson from '../regions/moonlake/levels.json';
import type { LanternLevel } from '../regions/moonlake/model';
import { SampleA } from './sampleA';
import { SampleB } from './sampleB';
import { SampleC } from './sampleC';

// Style samples: the same Moon Lake level ("Firefly") in three looks, to choose a direction.
//   A  2.5D: the game as it is, with more depth
//   B  a 3D world behind the same flat puzzle
//   C  everything in 3D
// Each is playable. A switch at the top flips between them.

const level = (levelsJson as LanternLevel[])[4]!;
const SAMPLES = [
  { key: 'A', name: '2.5D', note: 'Today’s game, with more depth: moonlight shafts, drifting mist.', make: (h: HTMLElement, s: () => void) => new SampleA(h, level, s) },
  { key: 'B', name: '3D world', note: 'A real 3D lake and sky behind the same flat puzzle.', make: (h: HTMLElement, s: () => void) => new SampleB(h, level, s) },
  { key: 'C', name: 'All 3D', note: 'The puzzle itself in 3D: stones, lanterns and light on the water.', make: (h: HTMLElement, s: () => void) => new SampleC(h, level, s) },
] as const;

const root = document.getElementById('samples')!;
const style = document.createElement('style');
style.textContent = `
  html, body { margin: 0; height: 100%; background: ${cssHex('void')}; overflow: hidden; font-family: Quicksand, sans-serif; color: ${cssHex('pearl')}; }
  #samples { position: fixed; inset: 0; }
  .stage { position: absolute; inset: 0; }
  .bar { position: absolute; left: 0; right: 0; top: env(safe-area-inset-top, 0); z-index: 5; display: flex; align-items: center; gap: 8px; padding: 10px 14px; }
  .bar button { flex: 1; font: inherit; font-size: 14px; letter-spacing: 1px; padding: 9px 6px; border-radius: 18px; border: 1px solid rgba(247,244,255,0.25); background: rgba(11,11,16,0.55); color: inherit; }
  .bar button.on { background: rgba(205,184,255,0.25); border-color: ${cssHex('lavender')}; }
  .bar a { color: inherit; opacity: 0.6; text-decoration: none; font-size: 22px; padding: 0 6px; }
  .note { position: absolute; left: 0; right: 0; bottom: calc(env(safe-area-inset-bottom, 0) + 18px); z-index: 5; text-align: center; font-size: 14px; letter-spacing: 1px; opacity: 0.7; padding: 0 20px; pointer-events: none; }
  .done { position: absolute; left: 50%; top: 22%; transform: translateX(-50%); z-index: 6; font-size: 20px; letter-spacing: 2px; opacity: 0; transition: opacity 1s; pointer-events: none; }
`;
document.head.appendChild(style);

const stage = document.createElement('div');
stage.className = 'stage';
const bar = document.createElement('div');
bar.className = 'bar';
const back = document.createElement('a');
back.href = 'index.html';
back.textContent = '‹';
bar.appendChild(back);
const note = document.createElement('div');
note.className = 'note';
const done = document.createElement('div');
done.className = 'done';
done.textContent = 'The whole lake glows';
root.append(stage, bar, note, done);

let current: { destroy(): void } | null = null;
const buttons = SAMPLES.map((s, i) => {
  const b = document.createElement('button');
  b.textContent = `${s.key} · ${s.name}`;
  b.addEventListener('click', () => show(i));
  bar.appendChild(b);
  return b;
});

function show(i: number): void {
  current?.destroy();
  stage.replaceChildren();
  done.style.opacity = '0';
  buttons.forEach((b, k) => b.classList.toggle('on', k === i));
  const s = SAMPLES[i]!;
  note.textContent = s.note;
  current = s.make(stage, () => (done.style.opacity = '0.9'));
  (window as unknown as { __sample: unknown }).__sample = current;
  try {
    localStorage.setItem('chowa.sample', String(i));
  } catch {
    // ignore
  }
}

let start = 0;
try {
  start = Number(localStorage.getItem('chowa.sample') ?? 0) || 0;
} catch {
  // ignore
}
show(Math.min(2, Math.max(0, start)));
