import { cssHex, rgba } from '../design/palette';
import {
  type InstallContext,
  INSTALL_PARAM,
  chromeIntent,
  clearInstallPrompt,
  installLink,
  installPrompt,
  onInstallPromptReady,
  safariLink,
} from '../core/install';

// The page the install link opens (`?install`): helps someone put Chōwa on their home
// screen. Android installs from one tap on our button; iPhone is walked through
// Safari's own menu, since no page may add itself there.

// How long to wait for Chrome to offer its install prompt before showing the manual steps.
const PROMPT_WAIT_MS = 2500;

const icons = {
  share: `<svg viewBox="0 0 24 24"><path d="M12 3v12M7.5 7.5 12 3l4.5 4.5M6 11H5v10h14V11h-1"/></svg>`,
  more: `<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/></svg>`,
  dots: `<svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="12" cy="19" r="1.3"/></svg>`,
  add: `<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8.5v7M8.5 12h7"/></svg>`,
  check: `<svg viewBox="0 0 24 24"><path d="M6 12.5 10 16.5 18 8"/></svg>`,
};

const css = `
.chowa-install { position: fixed; inset: 0; z-index: 20; display: flex; align-items: center; justify-content: center;
  background: ${rgba('void', 0.94)}; font-family: Quicksand, sans-serif; font-weight: 300; color: ${cssHex('pearl')};
  opacity: 0; transition: opacity .5s ease; padding: 16px; box-sizing: border-box; }
.chowa-install.open { opacity: 1; }
.chowa-install .card { width: min(100%, 380px); text-align: center; }
.chowa-install .light { width: 34px; height: 34px; margin: 0 auto 18px; border-radius: 50%; position: relative;
  background: ${cssHex('lavender')}; box-shadow: 0 0 26px 6px ${rgba('lavender', 0.45)}; animation: chowa-breathe 4s ease-in-out infinite; }
.chowa-install .light::before, .chowa-install .light::after { content: ''; position: absolute; top: 13px; width: 4px; height: 4px;
  border-radius: 50%; background: ${cssHex('void')}; animation: chowa-blink 5s infinite; }
.chowa-install .light::before { left: 10px; } .chowa-install .light::after { right: 10px; }
.chowa-install h1 { margin: 0 0 6px; font-weight: 300; font-size: 30px; letter-spacing: 6px; }
.chowa-install .lead { margin: 0 0 26px; font-size: 15px; line-height: 1.5; opacity: .75; }
.chowa-install .steps { display: flex; flex-direction: column; gap: 10px; text-align: left; margin-bottom: 22px; }
.chowa-install .step { display: flex; align-items: center; gap: 14px; padding: 12px 14px; border-radius: 14px;
  border: 1px solid ${cssHex('dim')}; background: ${cssHex('ink')}; font-size: 15px; line-height: 1.4;
  animation: chowa-step 6s ease-in-out infinite; }
.chowa-install .step:nth-child(2) { animation-delay: 2s; } .chowa-install .step:nth-child(3) { animation-delay: 4s; }
.chowa-install .num { flex: none; width: 24px; height: 24px; border-radius: 50%; border: 1px solid ${cssHex('dim')};
  display: flex; align-items: center; justify-content: center; font-size: 13px; opacity: .8; }
.chowa-install svg { width: 20px; height: 20px; vertical-align: -4px; fill: none; stroke: ${cssHex('pearl')}; stroke-width: 1.6;
  stroke-linecap: round; stroke-linejoin: round; }
.chowa-install svg circle { fill: ${cssHex('pearl')}; stroke: none; }
.chowa-install b { font-weight: 400; color: ${cssHex('lavender')}; }
.chowa-install button.main { font: inherit; font-size: 18px; letter-spacing: 2px; border-radius: 999px; padding: 15px 34px;
  cursor: pointer; border: 1px solid ${cssHex('lavender')}; background: ${rgba('lavender', 0.1)}; color: ${cssHex('pearl')};
  box-shadow: 0 0 24px ${rgba('lavender', 0.25)}; margin-bottom: 18px; transition: opacity .3s ease; }
.chowa-install button.main:disabled { opacity: .35; box-shadow: none; }
.chowa-install .quiet { display: inline-block; margin-top: 8px; font-size: 14px; opacity: .55; color: inherit; background: none;
  border: none; font-family: inherit; cursor: pointer; text-decoration: underline; padding: 8px; }
.chowa-install .note { font-size: 13px; opacity: .6; line-height: 1.5; margin: 0 0 14px; }
.chowa-install .arrow { position: fixed; left: 50%; bottom: 14px; width: 28px; height: 28px; margin-left: -14px;
  animation: chowa-point 1.6s ease-in-out infinite; }
.chowa-install .arrow.top { bottom: auto; top: 10px; left: auto; right: 14px; margin: 0; animation-name: chowa-point-up; }
.chowa-install .arrow svg { width: 28px; height: 28px; stroke: ${cssHex('lavender')}; }
@keyframes chowa-breathe { 0%,100% { transform: scale(1); } 50% { transform: scale(1.08); } }
@keyframes chowa-blink { 0%,94%,100% { transform: scaleY(1); } 97% { transform: scaleY(.1); } }
@keyframes chowa-step { 0%,100% { border-color: ${cssHex('dim')}; } 12%,28% { border-color: ${cssHex('lavender')}; box-shadow: 0 0 18px ${rgba('lavender', 0.18)}; } 40% { border-color: ${cssHex('dim')}; box-shadow: none; } }
@keyframes chowa-point { 0%,100% { transform: translateY(0); opacity: .5; } 50% { transform: translateY(8px); opacity: 1; } }
@keyframes chowa-point-up { 0%,100% { transform: translateY(0); opacity: .5; } 50% { transform: translateY(-6px); opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .chowa-install * { animation: none !important; } }
`;

const arrowDown = `<svg viewBox="0 0 24 24"><path d="M12 4v15M6 13l6 6 6-6"/></svg>`;
const arrowUp = `<svg viewBox="0 0 24 24"><path d="M12 20V5M6 11l6-6 6 6"/></svg>`;

export class InstallGuide {
  private root: HTMLDivElement;

  constructor(
    private context: InstallContext,
    private onClose: () => void,
  ) {
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
    this.root = document.createElement('div');
    this.root.className = 'chowa-install';
    document.body.appendChild(this.root);
    this.render();
    requestAnimationFrame(() => this.root.classList.add('open'));
  }

  private render(): void {
    const { host, pathname } = location;
    switch (this.context) {
      case 'android':
        this.card('Keep it on your home screen and play like an app, even offline.', `<button class="main" disabled>Install</button>`);
        this.waitForPrompt();
        break;
      case 'android-inapp':
        this.card(
          'This app cannot install games. Open the page in Chrome to add it.',
          `<button class="main">Open in Chrome</button>
           <p class="note">Or tap ${icons.dots} and choose <b>Open in Chrome</b>.</p>`,
        );
        this.root.querySelector('button.main')!.addEventListener('click', () => (location.href = chromeIntent(host, pathname)));
        break;
      case 'ios-other':
        this.card(
          'On iPhone, games are added to the home screen from Safari.',
          `<button class="main">Open in Safari</button>
           <p class="note">Nothing happens? <button class="quiet copy">Copy the link</button> and paste it into Safari.</p>`,
        );
        this.root.querySelector('button.main')!.addEventListener('click', () => (location.href = safariLink(host, pathname)));
        this.root.querySelector('button.copy')!.addEventListener('click', (e) => void this.copyLink(e.currentTarget as HTMLButtonElement));
        break;
      case 'ios-safari':
      default:
        this.card(
          'Keep it on your home screen and play like an app, even offline.',
          `<div class="steps">
             <div class="step"><span class="num">1</span><span>Tap ${icons.share} <b>Share</b> below. On newer iPhones it is inside ${icons.more}</span></div>
             <div class="step"><span class="num">2</span><span>Choose ${icons.add} <b>Add to Home Screen</b>. Scroll down or tap <b>View More</b> if you do not see it.</span></div>
             <div class="step"><span class="num">3</span><span>Tap <b>Add</b>. Chōwa appears with your apps.</span></div>
           </div>`,
          `<div class="arrow">${arrowDown}</div>`,
        );
    }
  }

  private card(lead: string, body: string, extra = ''): void {
    this.root.innerHTML = `
      <div class="card">
        <div class="light"></div>
        <h1>Chōwa</h1>
        <p class="lead">${lead}</p>
        ${body}
        <div><button class="quiet play">Play here instead</button></div>
      </div>${extra}`;
    this.root.querySelector('button.play')!.addEventListener('click', () => this.close());
  }

  // Android: the button wakes up when Chrome says the game can be installed.
  private waitForPrompt(): void {
    const button = this.root.querySelector<HTMLButtonElement>('button.main')!;
    const fallback = setTimeout(() => this.showManualAndroid(), PROMPT_WAIT_MS);
    onInstallPromptReady(() => {
      clearTimeout(fallback);
      button.disabled = false;
    });
    button.addEventListener('click', async () => {
      const prompt = installPrompt();
      if (!prompt) return;
      await prompt.prompt();
      const choice = await prompt.userChoice;
      clearInstallPrompt();
      if (choice.outcome === 'accepted') this.showDone();
      else button.disabled = true;
    });
  }

  private showManualAndroid(): void {
    if (installPrompt()) return;
    this.card(
      'Keep it on your home screen and play like an app, even offline.',
      `<div class="steps">
         <div class="step"><span class="num">1</span><span>Tap ${icons.dots} at the top right.</span></div>
         <div class="step"><span class="num">2</span><span>Choose <b>Install app</b> or <b>Add to Home screen</b>.</span></div>
         <div class="step"><span class="num">3</span><span>Tap <b>Install</b>. Already there? Open Chōwa from your home screen.</span></div>
       </div>`,
      `<div class="arrow top">${arrowUp}</div>`,
    );
  }

  private showDone(): void {
    this.card(`${icons.check} Chōwa is on your home screen. Open it from there any time.`, '');
  }

  private async copyLink(button: HTMLButtonElement): Promise<void> {
    try {
      await navigator.clipboard.writeText(installLink(location.origin, location.pathname));
      button.textContent = 'Copied';
    } catch {
      button.textContent = installLink(location.origin, location.pathname);
    }
  }

  private close(): void {
    // Drop `?install` so a reload plays the game.
    const url = new URL(location.href);
    url.searchParams.delete(INSTALL_PARAM);
    history.replaceState(null, '', url);
    this.root.classList.remove('open');
    setTimeout(() => this.root.remove(), 500);
    this.onClose();
  }
}
