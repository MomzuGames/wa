import { Container } from 'pixi.js';
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
    this.backButton.visible = false;
    this.helpButton.visible = false;
    this.hintButton.visible = false;
    this.addChild(this.settingsButton, this.backButton, this.helpButton, this.hintButton, this.accountButton);
  }

  setBackVisible(visible: boolean): void {
    this.backButton.visible = visible;
  }

  setAccountButton(handler: (() => void) | null): void {
    this.accountButton.visible = handler !== null;
    this.onAccount = handler ?? (() => {});
  }

  // The help (?) and hint buttons only exist while a level is being played.
  setLevelButtons(handlers: { onHelp: () => void; onHint: () => void } | null): void {
    this.helpButton.visible = handlers !== null;
    this.hintButton.visible = handlers !== null;
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
    this.accountButton.position.set(right - gap, top);
    this.backButton.position.set(hud.left(), top);
  }
}
