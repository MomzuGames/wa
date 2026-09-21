import { createProfile, currentProfile, deleteProfile, exportBackup, importBackup, listProfiles, selectProfile, type Profile, type ProfileColor } from '../core/save';
import { cssHex } from '../design/palette';

// The one piece of DOM in the game: choosing which light you are. Each light is a
// named profile with its own save on this device. No accounts, nothing leaves the device.

const COLORS: ProfileColor[] = ['mint', 'lavender', 'peach', 'sky', 'rose'];

const css = `
.chowa-profiles { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center;
  background: rgba(0,0,0,0.62); font-family: Quicksand, sans-serif; font-weight: 300; color: ${cssHex('pearl')};
  z-index: 10; opacity: 0; transition: opacity .35s ease; }
.chowa-profiles.open { opacity: 1; }
.chowa-profiles .card { width: min(92vw, 400px); background: ${cssHex('ink')}; border: 1px solid ${cssHex('dim')};
  border-radius: 18px; padding: 26px 24px; box-shadow: 0 20px 60px rgba(0,0,0,.6); }
.chowa-profiles h2 { margin: 0 0 6px; font-weight: 300; font-size: 22px; letter-spacing: 2px; }
.chowa-profiles p { margin: 0 0 16px; font-size: 14px; line-height: 1.5; opacity: .8; }
.chowa-profiles .list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 14px; }
.chowa-profiles .row { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 12px;
  border: 1px solid ${cssHex('dim')}; cursor: pointer; background: transparent; color: inherit; font: inherit; text-align: left; width: 100%; }
.chowa-profiles .row:hover { background: rgba(247,244,255,.05); }
.chowa-profiles .row.current { border-color: ${cssHex('pearl')}; }
.chowa-profiles .light { width: 22px; height: 22px; border-radius: 50%; flex: none; position: relative; box-shadow: 0 0 14px 2px var(--c); background: var(--c); }
.chowa-profiles .light::before, .chowa-profiles .light::after { content: ''; position: absolute; top: 8px; width: 3px; height: 3px; border-radius: 50%; background: ${cssHex('void')}; }
.chowa-profiles .light::before { left: 6px; } .chowa-profiles .light::after { right: 6px; }
.chowa-profiles .name { flex: 1; font-size: 16px; letter-spacing: 1px; }
.chowa-profiles .tag { font-size: 12px; opacity: .55; }
.chowa-profiles .del { border: none; background: transparent; color: inherit; opacity: .4; cursor: pointer; font-size: 16px; padding: 4px 6px; }
.chowa-profiles .del:hover { opacity: .9; }
.chowa-profiles input { width: 100%; box-sizing: border-box; background: ${cssHex('void')}; color: ${cssHex('pearl')};
  border: 1px solid ${cssHex('dim')}; border-radius: 10px; padding: 12px 14px; font: inherit; font-size: 16px; outline: none; margin-bottom: 12px; }
.chowa-profiles input:focus { border-color: ${cssHex('mint')}; }
.chowa-profiles .swatches { display: flex; gap: 12px; margin-bottom: 16px; }
.chowa-profiles .swatch { width: 30px; height: 30px; border-radius: 50%; cursor: pointer; border: 2px solid transparent; background: var(--c); box-shadow: 0 0 10px var(--c); opacity: .75; }
.chowa-profiles .swatch.on { border-color: ${cssHex('pearl')}; opacity: 1; }
.chowa-profiles button.action { font: inherit; font-size: 15px; letter-spacing: 1px; border-radius: 999px; padding: 11px 18px; cursor: pointer;
  border: 1px solid ${cssHex('mint')}; background: transparent; color: ${cssHex('pearl')}; margin-right: 8px; margin-top: 4px; }
.chowa-profiles button.action.quiet { border-color: ${cssHex('dim')}; opacity: .75; }
.chowa-profiles button.action:hover { background: rgba(184,242,230,.08); }
.chowa-profiles .error { color: ${cssHex('peach')}; font-size: 13px; margin-top: 8px; }
.chowa-profiles .ok { color: ${cssHex('mint')}; font-size: 13px; margin-top: 8px; }
.chowa-profiles textarea { width: 100%; box-sizing: border-box; background: ${cssHex('void')}; color: ${cssHex('pearl')}; border: 1px solid ${cssHex('dim')}; border-radius: 10px; padding: 10px 12px; font: inherit; font-size: 12px; outline: none; margin-bottom: 12px; min-height: 84px; word-break: break-all; }
.chowa-profiles .links { margin-top: 14px; font-size: 13px; opacity: .6; }
.chowa-profiles .links a { color: inherit; cursor: pointer; text-decoration: underline; margin-right: 14px; }
`;

let styled = false;

function ensureStyle(): void {
  if (styled) return;
  styled = true;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
}

export class ProfileOverlay {
  private root: HTMLDivElement | null = null;

  constructor(private onChange: () => void) {}

  open(): void {
    if (this.root) return;
    ensureStyle();
    const root = document.createElement('div');
    root.className = 'chowa-profiles';
    document.body.appendChild(root);
    this.root = root;
    this.renderList();
    requestAnimationFrame(() => root.classList.add('open'));
  }

  close(): void {
    const root = this.root;
    if (!root) return;
    this.root = null;
    root.classList.remove('open');
    setTimeout(() => root.remove(), 350);
  }

  private card(): HTMLElement {
    const root = this.root!;
    root.replaceChildren();
    const card = document.createElement('div');
    card.className = 'card';
    root.appendChild(card);
    return card;
  }

  private renderList(): void {
    const card = this.card();
    const profiles = listProfiles();
    const current = currentProfile();
    card.innerHTML = profiles.length
      ? `<h2>Who is playing?</h2><p>Each light keeps its own journey on this device.</p>`
      : `<h2>Welcome</h2><p>Make a light for yourself. Each light keeps its own journey on this device, so everyone in the house can play at their own pace.</p>`;
    const list = document.createElement('div');
    list.className = 'list';
    for (const p of profiles) list.appendChild(this.row(p, current?.id === p.id));
    card.appendChild(list);
    const add = button(profiles.length ? 'New light' : 'Make my light', '', () => this.renderNew());
    card.appendChild(add);
    if (current) card.appendChild(button('Close', 'quiet', () => this.close()));
    const links = document.createElement('div');
    links.className = 'links';
    const backup = document.createElement('a');
    backup.textContent = 'Back up';
    backup.addEventListener('click', () => this.renderBackup());
    const restore = document.createElement('a');
    restore.textContent = 'Restore';
    restore.addEventListener('click', () => this.renderRestore());
    links.append(backup, restore);
    card.appendChild(links);
  }

  // A backup code holds every light and its progress on this device.
  private renderBackup(): void {
    const card = this.card();
    card.innerHTML = `<h2>Back up</h2><p>Copy this code somewhere safe (Notes, an email to yourself). Paste it into Restore on any device to bring your lights and progress back.</p>`;
    const box = document.createElement('textarea');
    box.readOnly = true;
    box.value = exportBackup();
    const ok = document.createElement('div');
    ok.className = 'ok';
    const copy = button('Copy code', '', async () => {
      try {
        await navigator.clipboard.writeText(box.value);
        ok.textContent = 'Copied.';
      } catch {
        box.select();
        ok.textContent = 'Select the code above and copy it.';
      }
    });
    const back = button('Back', 'quiet', () => this.renderList());
    card.append(box, copy, back, ok);
  }

  private renderRestore(): void {
    const card = this.card();
    card.innerHTML = `<h2>Restore</h2><p>Paste a backup code. Lights are added to this device; progress for a light already here is combined, never lost.</p>`;
    const box = document.createElement('textarea');
    box.placeholder = 'chowa1.…';
    const error = document.createElement('div');
    error.className = 'error';
    const go = button('Restore', '', () => {
      try {
        const n = importBackup(box.value);
        this.onChange();
        this.renderList();
        const note = document.createElement('div');
        note.className = 'ok';
        note.textContent = `Restored ${n} light${n === 1 ? '' : 's'}.`;
        this.root?.querySelector('.card')?.appendChild(note);
      } catch {
        error.textContent = 'That is not a backup code. Copy the whole code, starting with chowa1.';
      }
    });
    const back = button('Back', 'quiet', () => this.renderList());
    card.append(box, go, back, error);
  }

  private row(p: Profile, isCurrent: boolean): HTMLElement {
    const row = document.createElement('button');
    row.className = `row${isCurrent ? ' current' : ''}`;
    row.style.setProperty('--c', cssHex(p.color));
    row.innerHTML = `<span class="light"></span><span class="name">${escapeHtml(p.name)}</span>${isCurrent ? '<span class="tag">playing</span>' : ''}`;
    row.addEventListener('click', () => {
      selectProfile(p.id);
      this.close();
      this.onChange();
    });
    const del = document.createElement('button');
    del.className = 'del';
    del.title = 'Remove this light';
    del.textContent = '×';
    del.addEventListener('click', (e) => {
      e.stopPropagation();
      this.renderConfirmDelete(p);
    });
    row.appendChild(del);
    return row;
  }

  private renderNew(): void {
    const card = this.card();
    card.innerHTML = `<h2>A new light</h2><p>Choose a name and a colour.</p>`;
    const name = document.createElement('input');
    name.placeholder = 'Name';
    name.maxLength = 24;
    name.autocomplete = 'off';
    const swatches = document.createElement('div');
    swatches.className = 'swatches';
    let chosen: ProfileColor = COLORS[listProfiles().length % COLORS.length]!;
    const draw = () => {
      swatches.replaceChildren();
      for (const c of COLORS) {
        const s = document.createElement('div');
        s.className = `swatch${c === chosen ? ' on' : ''}`;
        s.style.setProperty('--c', cssHex(c));
        s.addEventListener('click', () => {
          chosen = c;
          draw();
        });
        swatches.appendChild(s);
      }
    };
    draw();
    const error = document.createElement('div');
    error.className = 'error';
    const make = button('Begin', '', () => {
      if (!name.value.trim()) {
        error.textContent = 'Give your light a name.';
        return;
      }
      const p = createProfile(name.value, chosen);
      selectProfile(p.id);
      this.close();
      this.onChange();
    });
    const back = button('Back', 'quiet', () => this.renderList());
    card.append(name, swatches, make, listProfiles().length ? back : document.createTextNode(''), error);
    name.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') make.click();
    });
    setTimeout(() => name.focus(), 50);
  }

  private renderConfirmDelete(p: Profile): void {
    const card = this.card();
    card.innerHTML = `<h2>Remove ${escapeHtml(p.name)}?</h2><p>This light and all of its progress on this device will be gone. This cannot be undone.</p>`;
    const yes = button('Remove', '', () => {
      deleteProfile(p.id);
      const remaining = listProfiles();
      if (!currentProfile() && remaining[0]) selectProfile(remaining[0].id);
      this.onChange();
      this.renderList();
    });
    const no = button('Keep it', 'quiet', () => this.renderList());
    card.append(yes, no);
  }
}

function button(label: string, cls: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = `action${cls ? ` ${cls}` : ''}`;
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
