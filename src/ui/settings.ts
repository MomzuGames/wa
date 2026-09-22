import gsap from 'gsap';
import { Container, Graphics } from 'pixi.js';
import { alphas, palette } from '../design/palette';
import { durations, easings, setReducedMotion } from '../design/motion';
import { layout } from '../design/layout';
import { getSettings, resetProgress, updateSettings } from '../core/save';
import { qualitySetting, setQualitySetting, type QualitySetting } from '../design/quality';
import { events } from '../core/events';
import type { AudioEngine } from '../audio/engine';
import { IconButton } from './iconButton';
import { Slider } from './slider';
import { note } from '../audio/scale';
import { drawIcon } from './icons';
import { HoldButton } from './holdButton';

const panelStyle = {
  width: 300,
  height: 200,
  radius: 18,
  rowGap: 52,
  iconSize: 26,
} as const;

export class SettingsPanel extends Container {
  private backdrop = new Graphics();
  private card = new Container();
  private open = false;
  private muteButton: IconButton;
  private motionButton: IconButton;
  private qualityButton: IconButton;
  private screenW = 0;
  private screenH = 0;

  constructor(
    private audio: AudioEngine,
    onReset: () => void,
  ) {
    super();
    this.visible = false;
    this.alpha = 0;

    this.backdrop.eventMode = 'static';
    this.backdrop.on('pointertap', () => this.toggle());

    const panel = new Graphics()
      .roundRect(-panelStyle.width / 2, -panelStyle.height / 2, panelStyle.width, panelStyle.height, panelStyle.radius)
      .fill({ color: palette.ink })
      .stroke({ color: palette.dim, width: 1 });
    panel.eventMode = 'static';
    this.card.addChild(panel);

    const settings = getSettings();
    const left = -panelStyle.width / 2 + layout.margin;
    const sliderX = left + panelStyle.iconSize + 22;
    let y = -panelStyle.height / 2 + 44;

    this.addRow('note', y, left);
    const music = new Slider(
      settings.music,
      (v) => updateSettings({ music: v }),
    );
    music.position.set(sliderX, y);
    this.card.addChild(music);
    y += panelStyle.rowGap;

    this.addRow('sparkle', y, left);
    const sfx = new Slider(
      settings.sfx,
      (v) => updateSettings({ sfx: v }),
      () => this.audio.pluck(note(2, 5)),
    );
    sfx.position.set(sliderX, y);
    this.card.addChild(sfx);
    y += panelStyle.rowGap;

    this.muteButton = new IconButton(
      settings.muted ? 'speakerOff' : 'speaker',
      () => this.toggleMute(),
      panelStyle.iconSize,
    );
    this.muteButton.position.set(left + panelStyle.iconSize / 2, y);
    this.card.addChild(this.muteButton);
    this.syncToggleAlpha(this.muteButton, !settings.muted);

    this.motionButton = new IconButton('leaf', () => this.toggleMotion(), panelStyle.iconSize);
    this.motionButton.position.set(left + panelStyle.iconSize / 2 + 58, y);
    this.card.addChild(this.motionButton);
    this.syncToggleAlpha(this.motionButton, settings.reducedMotion);
    setReducedMotion(settings.reducedMotion);

    // Visual richness: automatic (follows the frame rate), always rich, or always plain.
    this.qualityButton = new IconButton('quality', () => this.cycleQuality(), panelStyle.iconSize);
    this.qualityButton.position.set(left + panelStyle.iconSize / 2 + 116, y);
    this.card.addChild(this.qualityButton);
    this.syncQualityAlpha();

    // Hold to erase progress: the ring around the icon fills over 1.5 s.
    const reset = new HoldButton('restart', panelStyle.iconSize, () => {
      resetProgress();
      this.audio.failure();
      this.toggle();
      onReset();
    });
    reset.position.set(panelStyle.width / 2 - layout.margin - panelStyle.iconSize / 2, y);
    this.card.addChild(reset);

    this.addChild(this.backdrop, this.card);
    events.on('input:mute', () => this.toggleMute());
  }

  private addRow(icon: 'note' | 'sparkle', y: number, left: number): void {
    const g = new Graphics();
    drawIcon(g, icon, panelStyle.iconSize, palette.pearl);
    g.alpha = alphas.hudIdle;
    g.position.set(left + panelStyle.iconSize / 2, y);
    this.card.addChild(g);
  }

  private syncToggleAlpha(button: IconButton, on: boolean): void {
    // Toggle buttons show their state by brightness rather than a label.
    gsap.to(button, { alpha: on ? alphas.hudHover : alphas.hudIdle, duration: durations.hudHover });
  }

  private toggleMute(): void {
    const next = !getSettings().muted;
    updateSettings({ muted: next });
    this.muteButton.setIcon(next ? 'speakerOff' : 'speaker');
    this.syncToggleAlpha(this.muteButton, !next);
  }

  // Auto (half lit) -> high (fully lit) -> low (dim) -> auto.
  private cycleQuality(): void {
    const order: QualitySetting[] = ['auto', 'high', 'low'];
    const next = order[(order.indexOf(qualitySetting()) + 1) % order.length]!;
    setQualitySetting(next);
    updateSettings({ quality: next });
    this.syncQualityAlpha();
    this.audio.pluck(note(next === 'low' ? 0 : next === 'auto' ? 2 : 4, 4));
  }

  private syncQualityAlpha(): void {
    const setting = qualitySetting();
    const alpha = setting === 'high' ? alphas.hudHover : setting === 'auto' ? (alphas.hudIdle + alphas.hudHover) / 2 : alphas.hudIdle * 0.7;
    gsap.to(this.qualityButton, { alpha, duration: durations.hudHover });
  }

  private toggleMotion(): void {
    const next = !getSettings().reducedMotion;
    updateSettings({ reducedMotion: next });
    setReducedMotion(next);
    this.syncToggleAlpha(this.motionButton, next);
    this.audio.pluck(note(next ? 0 : 3, 4));
  }

  resize(width: number, height: number): void {
    this.screenW = width;
    this.screenH = height;
    this.backdrop.clear().rect(0, 0, width, height).fill({ color: palette.shadow, alpha: alphas.panelBackdrop });
    this.card.position.set(width / 2, height / 2);
    const fit = Math.min(1, (width - 24) / panelStyle.width);
    this.card.scale.set(fit);
  }

  toggle(): void {
    this.open = !this.open;
    if (this.open) {
      this.visible = true;
      this.resize(this.screenW, this.screenH);
      const fit = Math.min(1, (this.screenW - 24) / panelStyle.width);
      this.card.scale.set(fit * 0.96);
      gsap.to(this, { alpha: 1, duration: durations.panelToggle, ease: easings.response });
      gsap.to(this.card.scale, { x: fit, y: fit, duration: durations.panelToggle, ease: easings.response });
    } else {
      gsap.to(this, {
        alpha: 0,
        duration: durations.panelToggle,
        ease: easings.response,
        onComplete: () => {
          this.visible = false;
        },
      });
    }
  }

  get isOpen(): boolean {
    return this.open;
  }
}
