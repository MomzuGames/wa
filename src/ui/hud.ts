import { Container } from 'pixi.js';
import { layout } from '../design/layout';
import { events } from '../core/events';
import { IconButton } from './iconButton';
import type { SettingsPanel } from './settings';

export class Hud extends Container {
  private settingsButton: IconButton;
  private backButton: IconButton;
  private screenWidth = 0;

  constructor(settings: SettingsPanel) {
    super();
    this.settingsButton = new IconButton('settings', () => settings.toggle());
    this.backButton = new IconButton('back', () => events.emit('input:back'));
    this.backButton.visible = false;
    this.addChild(this.settingsButton, this.backButton);
  }

  setBackVisible(visible: boolean): void {
    this.backButton.visible = visible;
  }

  resize(width: number): void {
    this.screenWidth = width;
    const inset = layout.hudInset + layout.hudIconSize / 2;
    this.settingsButton.position.set(this.screenWidth - inset, inset);
    this.backButton.position.set(inset, inset);
  }
}
