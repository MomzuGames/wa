import { cssHex, rgba } from '../design/palette';
import { progression } from '../core/progress';
import { STORE, purchase, restore, unlockWithCode } from '../core/store';

// The card that opens on a paid level: one story line and the way to unlock the full
// journey. On the website that is a family code; in the app, a purchase (for now the test
// store). Like the profile card, it is DOM, so text fields and buttons behave natively.

const FAMILY = ['mint', 'lavender', 'peach', 'sky', 'rose', 'sage'] as const;

const css = `
.chowa-unlock { position: fixed; inset: 0; z-index: 12; display: flex; align-items: center; justify-content: center;
  background: ${rgba('shadow', 0.62)}; font-family: Quicksand, sans-serif; font-weight: 300; color: ${cssHex('pearl')};
  opacity: 0; transition: opacity .35s ease; padding: 16px; box-sizing: border-box; }
.chowa-unlock.open { opacity: 1; }
.chowa-unlock .card { box-sizing: border-box; width: min(100%, 380px); background: ${cssHex('ink')}; border: 1px solid ${cssHex('dim')};
  border-radius: 18px; padding: 26px 24px; text-align: center; box-shadow: 0 20px 60px ${rgba('shadow', 0.6)}; }
.chowa-unlock .family { position: relative; width: 120px; height: 70px; margin: 0 auto 14px; }
.chowa-unlock .me { position: absolute; left: 50%; top: 50%; width: 22px; height: 22px; margin: -11px; border-radius: 50%;
  background: ${cssHex('pearl')}; box-shadow: 0 0 16px 3px ${rgba('pearl', 0.45)}; }
.chowa-unlock .kin { position: absolute; width: 9px; height: 9px; margin: -4.5px; border-radius: 50%; opacity: .35;
  animation: chowa-kin 3.2s ease-in-out infinite; }
@keyframes chowa-kin { 0%, 100% { opacity: .2; } 50% { opacity: .6; } }
.chowa-unlock h2 { margin: 0 0 8px; font-weight: 300; font-size: 21px; letter-spacing: 2px; }
.chowa-unlock p { margin: 0 0 18px; font-size: 14px; line-height: 1.55; opacity: .8; }
.chowa-unlock input { width: 100%; box-sizing: border-box; background: ${cssHex('void')}; color: ${cssHex('pearl')}; text-align: center;
  border: 1px solid ${cssHex('dim')}; border-radius: 10px; padding: 12px 14px; font: inherit; font-size: 16px; letter-spacing: 2px;
  outline: none; margin-bottom: 12px; }
.chowa-unlock input:focus { border-color: ${cssHex('lavender')}; }
.chowa-unlock button.action { font: inherit; font-size: 15px; letter-spacing: 1px; border-radius: 999px; padding: 12px 22px; cursor: pointer;
  border: 1px solid ${cssHex('lavender')}; background: ${rgba('lavender', 0.1)}; color: ${cssHex('pearl')}; width: 100%; }
.chowa-unlock .quiet { display: inline-block; margin: 12px 8px 0; font-size: 13px; opacity: .6; color: inherit; background: none;
  border: none; font-family: inherit; cursor: pointer; text-decoration: underline; padding: 6px; }
.chowa-unlock .note { font-size: 12px; opacity: .5; margin: 10px 0 0; }
.chowa-unlock .msg { font-size: 13px; margin: 10px 0 0; min-height: 1em; color: ${cssHex('peach')}; }
.chowa-unlock .msg.ok { color: ${cssHex('mint')}; }
@media (prefers-reduced-motion: reduce) { .chowa-unlock * { animation: none !important; } }
`;

let styled = false;

export class UnlockCard {
  private root: HTMLDivElement | null = null;

  open(): void {
    if (this.root) return;
    if (!styled) {
      styled = true;
      const style = document.createElement('style');
      style.textContent = css;
      document.head.appendChild(style);
    }
    const root = document.createElement('div');
    root.className = 'chowa-unlock';
    // Tapping outside the card closes it.
    root.addEventListener('pointerdown', (e) => {
      if (e.target === root) this.close();
    });
    document.body.appendChild(root);
    this.root = root;
    const free = progression.freeLevels;
    const more = (progression.levelsPerRegion - free) * 6;
    const kin = FAMILY.map((c, i) => {
      const a = (i / FAMILY.length) * Math.PI * 2 - Math.PI / 2;
      return `<div class="kin" style="left:${60 + Math.cos(a) * 50}px;top:${35 + Math.sin(a) * 28}px;background:${cssHex(c)};animation-delay:${-i * 0.5}s"></div>`;
    }).join('');
    const ways =
      STORE === 'code'
        ? `<input class="code" type="text" placeholder="Family code" autocomplete="off" autocapitalize="off" spellcheck="false">
           <button class="action unlock">Unlock</button>`
        : `<button class="action unlock">Unlock the full journey</button>
           <div><button class="quiet restore">Restore purchase</button></div>
           <p class="note">Test store: no payment is taken.</p>`;
    root.innerHTML = `
      <div class="card">
        <div class="family"><div class="me"></div>${kin}</div>
        <h2>Your family is waiting</h2>
        <p>The first ${free} puzzles in each of the six lands are free. Unlock the full journey to wake your family: ${more} more puzzles and the rest of the story.</p>
        ${ways}
        <div class="msg"></div>
        <div><button class="quiet later">Not now</button></div>
      </div>`;
    const msg = root.querySelector<HTMLDivElement>('.msg')!;
    const done = () => {
      msg.className = 'msg ok';
      msg.textContent = 'Welcome home. The full journey is open.';
      setTimeout(() => this.close(), 1600);
    };
    root.querySelector('.later')!.addEventListener('click', () => this.close());
    const input = root.querySelector<HTMLInputElement>('input.code');
    const tryUnlock = async () => {
      msg.className = 'msg';
      msg.textContent = '';
      if (input) {
        if (await unlockWithCode(input.value)) done();
        else msg.textContent = 'That code did not work. Check it and try again.';
      } else if (await purchase()) done();
    };
    root.querySelector('.unlock')!.addEventListener('click', () => void tryUnlock());
    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') void tryUnlock();
    });
    root.querySelector('.restore')?.addEventListener('click', async () => {
      if (await restore()) done();
      else {
        msg.className = 'msg';
        msg.textContent = 'No earlier purchase was found.';
      }
    });
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
