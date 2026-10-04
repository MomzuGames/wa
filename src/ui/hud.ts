import gsap from 'gsap';
import { Container, Graphics } from 'pixi.js';
import { palette } from '../design/palette';
import { durations, easings } from '../design/motion';
import { hud, hudGap } from '../design/layout';
import { events } from '../core/events';
import { IconButton } from './iconButton';
import type { SettingsPanel } from './settings';

export class Hud extends Container {
  private settingsButton: IconButton;
  private backButton: IconButton;
  private helpButton: IconButton;
  private hintButton: IconButton;
  private accountButton: IconButton;
  private storyButton: IconButton;
  // A soft glow behind the bulb when a hint would likely help.
  private hintGlow = new Graphics();
  private hintGlowTween: gsap.core.Tween | null = null;
  private onAccount: () => void = () => {};
  private onHelp: () => void = () => {};
  private onHint: () => void = () => {};

  constructor(settings: SettingsPanel) {
    super();
    this.settingsButton = new IconButton('settings', () => settings.toggle());
    this.backButton = new IconButton('back', () => events.emit('input:back'));
    this.helpButton = new IconButton('help', () => this.onHelp());
    this.hintButton = new IconButton('hint', () => this.onHint());
    this.accountButton = new IconButton('account', () => this.onAccount());
    // The story so far, on the title and the map (beside the person icon).
    this.storyButton = new IconButton('book', () => events.emit('story:book'));
    this.backButton.visible = false;
    this.helpButton.visible = false;
    this.hintButton.visible = false;
    this.hintGlow.circle(0, 0, 22).fill({ color: palette.pearl, alpha: 0.12 }).circle(0, 0, 14).fill({ color: palette.pearl, alpha: 0.12 });
    this.hintGlow.visible = false;
    this.hintGlow.eventMode = 'none';
    events.on('hint:ready', (ready) => this.setHintReady(ready));
    this.addChild(this.hintGlow, this.settingsButton, this.backButton, this.helpButton, this.hintButton, this.accountButton, this.storyButton);
  }

  setBackVisible(visible: boolean): void {
    this.backButton.visible = visible;
  }

  setAccountButton(handler: (() => void) | null): void {
    this.accountButton.visible = handler !== null;
    this.storyButton.visible = handler !== null;
    this.onAccount = handler ?? (() => {});
  }

  private setHintReady(ready: boolean): void {
    const show = ready && this.hintButton.visible;
    if (show === this.hintGlow.visible) return;
    this.hintGlow.visible = show;
    this.hintGlowTween?.kill();
    this.hintGlowTween = show ? gsap.fromTo(this.hintGlow, { alpha: 0.3 }, { alpha: 1, duration: durations.breathe / 2, yoyo: true, repeat: -1, ease: easings.ambient }) : null;
  }

  // The help (?) and hint buttons only exist while a level is being played.
  setLevelButtons(handlers: { onHelp: () => void; onHint: () => void } | null): void {
    this.helpButton.visible = handlers !== null;
    this.hintButton.visible = handlers !== null;
    if (!handlers) this.setHintReady(false);
    this.onHelp = handlers?.onHelp ?? (() => {});
    this.onHint = handlers?.onHint ?? (() => {});
  }

  resize(width: number): void {
    const gap = hudGap(width);
    const right = hud.right(width);
    const top = hud.top();
    this.settingsButton.position.set(right, top);
    this.helpButton.position.set(right - gap, top);
    this.hintButton.position.set(right - gap * 2, top);
    this.hintGlow.position.copyFrom(this.hintButton.position);
    this.accountButton.position.set(right - gap, top);
    this.storyButton.position.set(right - gap * 2, top);
    this.backButton.position.set(hud.left(), top);
  }
}
