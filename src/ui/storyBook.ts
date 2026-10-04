import { cssHex, rgba, type PaletteToken } from '../design/palette';
import { REGION_NAME, REGION_ORDER } from '../regions/catalog';
import { familyColor } from '../story/family';
import type { RegionId } from '../regions/types';
import { events } from '../core/events';
import { scene, type SceneId } from '../story/script';

// The Story screen (the book icon): every scene of the story in order. Scenes the player
// has reached are lit and play again when tapped; the rest wait as dim dots. DOM, like
// the profile card, so the list scrolls natively on a phone.

const ORDER: SceneId[] = [
  'prologue',
  ...REGION_ORDER.map((id) => `asleep:${id}` as SceneId),
  'waiting',
  ...REGION_ORDER.map((id) => `home:${id}` as SceneId),
  'finale',
];

function title(id: SceneId, player: PaletteToken): { name: string; color: PaletteToken } {
  if (id === 'prologue') return { name: 'The Silence', color: 'pearl' };
  if (id === 'waiting') return { name: 'Waiting', color: 'pearl' };
  if (id === 'finale') return { name: 'Together', color: 'pearl' };
  const [kind, region] = id.split(':') as ['asleep' | 'home', RegionId];
  return { name: `${REGION_NAME[region]}: ${kind === 'asleep' ? 'asleep' : 'home again'}`, color: familyColor(region, player) };
}

const css = `
.chowa-book { position: fixed; inset: 0; z-index: 11; display: flex; align-items: center; justify-content: center;
  background: ${rgba('shadow', 0.62)}; font-family: Quicksand, sans-serif; font-weight: 300; color: ${cssHex('pearl')};
  opacity: 0; transition: opacity .35s ease; padding: 16px; box-sizing: border-box; }
.chowa-book.open { opacity: 1; }
.chowa-book .card { box-sizing: border-box; width: min(100%, 400px); max-height: min(86vh, 640px); display: flex; flex-direction: column;
  background: ${cssHex('ink')}; border: 1px solid ${cssHex('dim')}; border-radius: 18px; padding: 24px 22px 16px;
  box-shadow: 0 20px 60px ${rgba('shadow', 0.6)}; }
.chowa-book h2 { margin: 0 0 4px; font-weight: 300; font-size: 22px; letter-spacing: 3px; text-align: center; }
.chowa-book .sub { margin: 0 0 14px; font-size: 13px; opacity: .6; text-align: center; }
.chowa-book .list { overflow-y: auto; -webkit-overflow-scrolling: touch; padding: 4px 2px; }
.chowa-book .row { display: flex; gap: 14px; align-items: flex-start; width: 100%; text-align: left; background: none; border: none;
  color: inherit; font: inherit; padding: 9px 8px; border-radius: 12px; cursor: pointer; position: relative; }
.chowa-book .row:hover:not(:disabled) { background: ${rgba('pearl', 0.05)}; }
.chowa-book .row:disabled { cursor: default; }
.chowa-book .dot { flex: none; width: 12px; height: 12px; margin-top: 4px; border-radius: 50%; background: var(--c); box-shadow: 0 0 10px var(--c); }
.chowa-book .row:disabled .dot { background: none; border: 1px solid ${cssHex('dim')}; box-shadow: none; }
.chowa-book .name { font-size: 15px; letter-spacing: 1px; }
.chowa-book .line { font-size: 13px; opacity: .65; margin-top: 2px; line-height: 1.4; }
.chowa-book .row:disabled .name { opacity: .4; }
.chowa-book .close { align-self: center; margin-top: 10px; font: inherit; font-size: 14px; opacity: .6; color: inherit; background: none;
  border: none; text-decoration: underline; cursor: pointer; padding: 6px; }
`;

let styled = false;

export class StoryBook {
  private root: HTMLDivElement | null = null;

  open(reached: ReadonlySet<SceneId>, player: PaletteToken): void {
    if (this.root) return;
    if (!styled) {
      styled = true;
      const style = document.createElement('style');
      style.textContent = css;
      document.head.appendChild(style);
    }
    const root = document.createElement('div');
    root.className = 'chowa-book';
    root.addEventListener('pointerdown', (e) => {
      if (e.target === root) this.close();
    });
    const rows = ORDER.map((id) => {
      const { name, color } = title(id, player);
      const open = reached.has(id);
      const line = open ? scene(id)[0]!.line : '· · ·';
      return `<button class="row" data-id="${id}" ${open ? '' : 'disabled'} style="--c:${cssHex(color)}">
        <span class="dot"></span><span><div class="name">${open ? name : 'Not yet'}</div><div class="line">${line}</div></span></button>`;
    }).join('');
    root.innerHTML = `
      <div class="card">
        <h2>The story</h2>
        <p class="sub">Tap a lit chapter to see it again.</p>
        <div class="list">${rows}</div>
        <button class="close">Close</button>
      </div>`;
    root.querySelector('.close')!.addEventListener('click', () => this.close());
    root.querySelectorAll<HTMLButtonElement>('.row:not(:disabled)').forEach((row) =>
      row.addEventListener('click', () => {
        this.close();
        events.emit('story:play', row.dataset.id!);
      }),
    );
    document.body.appendChild(root);
    this.root = root;
    requestAnimationFrame(() => root.classList.add('open'));
  }

  close(): void {
    const root = this.root;
    if (!root) return;
    this.root = null;
    root.classList.remove('open');
    setTimeout(() => root.remove(), 350);
  }
}
