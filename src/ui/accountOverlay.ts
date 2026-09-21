import { completeSignIn, currentUser, isSignInLink, rememberedEmail, requestSignInLink, signOutUser } from '../cloud/auth';
import { cssHex } from '../design/palette';
import { events } from '../core/events';

// The one piece of DOM in the game: a card with an email field for passwordless sign-in.
// Progress syncs to the cloud once signed in; the game plays the same without it.

const css = `
.chowa-account { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center;
  background: rgba(0,0,0,0.6); font-family: Quicksand, sans-serif; font-weight: 300; color: ${cssHex('pearl')};
  z-index: 10; opacity: 0; transition: opacity .35s ease; }
.chowa-account.open { opacity: 1; }
.chowa-account .card { width: min(92vw, 380px); background: ${cssHex('ink')}; border: 1px solid ${cssHex('dim')};
  border-radius: 18px; padding: 26px 24px; box-shadow: 0 20px 60px rgba(0,0,0,.6); }
.chowa-account h2 { margin: 0 0 6px; font-weight: 300; font-size: 22px; letter-spacing: 2px; }
.chowa-account p { margin: 0 0 16px; font-size: 14px; line-height: 1.5; opacity: .8; }
.chowa-account input { width: 100%; box-sizing: border-box; background: ${cssHex('void')}; color: ${cssHex('pearl')};
  border: 1px solid ${cssHex('dim')}; border-radius: 10px; padding: 12px 14px; font: inherit; font-size: 16px; outline: none; margin-bottom: 12px; }
.chowa-account input:focus { border-color: ${cssHex('mint')}; }
.chowa-account button { font: inherit; font-size: 15px; letter-spacing: 1px; border-radius: 999px; padding: 11px 18px; cursor: pointer;
  border: 1px solid ${cssHex('mint')}; background: transparent; color: ${cssHex('pearl')}; margin-right: 8px; margin-top: 4px; }
.chowa-account button.quiet { border-color: ${cssHex('dim')}; opacity: .75; }
.chowa-account button:hover { background: rgba(184,242,230,.08); }
.chowa-account .note { font-size: 13px; opacity: .65; margin-top: 12px; line-height: 1.5; }
.chowa-account .error { color: ${cssHex('peach')}; font-size: 13px; margin-top: 8px; }
`;

let styled = false;

function ensureStyle(): void {
  if (styled) return;
  styled = true;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
}

export class AccountOverlay {
  private root: HTMLDivElement | null = null;

  open(): void {
    if (this.root) return;
    ensureStyle();
    const root = document.createElement('div');
    root.className = 'chowa-account';
    document.body.appendChild(root);
    this.root = root;
    this.render();
    requestAnimationFrame(() => root.classList.add('open'));
  }

  close(): void {
    const root = this.root;
    if (!root) return;
    this.root = null;
    root.classList.remove('open');
    setTimeout(() => root.remove(), 350);
  }

  private render(): void {
    const root = this.root!;
    root.replaceChildren();
    const card = document.createElement('div');
    card.className = 'card';
    root.appendChild(card);
    const user = currentUser();
    if (user) this.renderSignedIn(card, user.email ?? '');
    else this.renderSignIn(card);
  }

  private renderSignedIn(card: HTMLElement, email: string): void {
    card.innerHTML = `<h2>Signed in</h2><p>${escapeHtml(email)}<br>Your progress is kept safe and follows you to any device you sign in on.</p>`;
    const out = button('Sign out', 'quiet', async () => {
      await signOutUser();
      events.emit('sync:state', 'signed-out');
      this.render();
    });
    const close = button('Close', '', () => this.close());
    card.append(out, close);
  }

  private renderSignIn(card: HTMLElement): void {
    card.innerHTML = `<h2>Keep your progress</h2><p>Sign in with your email to save your progress online and play the same journey on any device. There is no password: you get a link by email.</p>`;
    const email = document.createElement('input');
    email.type = 'email';
    email.placeholder = 'your@email.com';
    email.autocomplete = 'email';
    email.value = rememberedEmail() ?? '';
    const error = document.createElement('div');
    error.className = 'error';
    const send = button('Send me a link', '', async () => {
      error.textContent = '';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) {
        error.textContent = 'That does not look like an email address.';
        return;
      }
      send.disabled = true;
      try {
        await requestSignInLink(email.value);
        this.renderSent(card, email.value.trim().toLowerCase());
      } catch (e) {
        send.disabled = false;
        error.textContent = 'Could not send the link. Check your connection and try again.';
        console.warn(e);
      }
    });
    const guest = button('Play without signing in', 'quiet', () => this.close());
    card.append(email, send, guest, error);
    const paste = document.createElement('div');
    paste.className = 'note';
    paste.textContent = 'Already have a link from an email? Paste it here to finish signing in.';
    const link = document.createElement('input');
    link.placeholder = 'https://...';
    const finish = button('Finish sign-in', 'quiet', () => this.finish(link.value, email.value, error));
    card.append(paste, link, finish);
  }

  private renderSent(card: HTMLElement, email: string): void {
    card.innerHTML = `<h2>Check your email</h2><p>A sign-in link is on its way to <b>${escapeHtml(email)}</b>.<br><br>On this device, just open the link. If you are playing the home-screen app on a phone, copy the link from the email and paste it below.</p>`;
    const link = document.createElement('input');
    link.placeholder = 'Paste the link here';
    const error = document.createElement('div');
    error.className = 'error';
    const finish = button('Finish sign-in', '', () => this.finish(link.value, email, error));
    const close = button('Close', 'quiet', () => this.close());
    card.append(link, finish, close, error);
  }

  private async finish(link: string, email: string, error: HTMLElement): Promise<void> {
    error.textContent = '';
    if (!isSignInLink(link.trim())) {
      error.textContent = 'That is not a sign-in link. Copy the whole link from the email.';
      return;
    }
    try {
      await completeSignIn(link.trim(), email);
      this.render();
    } catch {
      error.textContent = 'The link did not work. It may have expired: send a new one.';
    }
  }
}

function button(label: string, cls: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = label;
  if (cls) b.className = cls;
  b.addEventListener('click', onClick);
  return b;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
