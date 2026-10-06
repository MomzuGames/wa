import gsap from 'gsap';
import { type Application, Container, Graphics, Text } from 'pixi.js';
import { palette, type PaletteToken } from '../design/palette';
import { scaled, storyTiming } from '../design/motion';
import { hud, safeArea } from '../design/layout';
import type { AudioEngine } from '../audio/engine';
import { buildArt, type Vignette } from './art';
import { scene, type Art, type SceneId } from './script';

// Plays story scenes over whatever is on screen: the world dims, a small animation plays,
// one short line fades in beneath it. Nothing moves on by itself: once the line has landed
// a faint dot breathes below it, and a tap moves on. Skip ends the story.

export class StoryPlayer extends Container {
  private backdrop = new Graphics();
  private stage = new Container();
  private line: Text;
  private skip: Text;
  private prompt = new Graphics();
  private promptTween: gsap.core.Tween | null = null;
  private finishBeat: (() => void) | null = null;
  private tapReady = false;
  private skipped = false;
  private current: Vignette | null = null;
  private onResize = () => this.layout();

  constructor(
    private app: Application,
    private hue: PaletteToken,
    private audio: AudioEngine,
  ) {
    super();
    this.line = new Text({
      text: '',
      style: { fontFamily: 'Quicksand', fontWeight: '300', fontSize: 20, letterSpacing: 1.5, fill: palette.pearl, align: 'center', wordWrap: true, wordWrapWidth: 480 },
      resolution: window.devicePixelRatio || 1,
    });
    this.line.anchor.set(0.5);
    this.skip = new Text({
      text: 'Skip',
      style: { fontFamily: 'Quicksand', fontWeight: '300', fontSize: 14, letterSpacing: 2, fill: palette.pearl },
      resolution: window.devicePixelRatio || 1,
    });
    this.skip.anchor.set(1, 0.5);
    this.skip.alpha = 0.45;
    this.skip.eventMode = 'static';
    this.skip.cursor = 'pointer';
    this.skip.on('pointertap', (e) => {
      e.stopPropagation();
      this.skipped = true;
      this.finishBeat?.();
    });
    this.prompt.circle(0, 0, 3).fill({ color: palette.pearl });
    this.prompt.alpha = 0;
    this.addChild(this.backdrop, this.stage, this.line, this.prompt, this.skip);
    this.eventMode = 'static';
    this.on('pointertap', () => {
      if (this.tapReady) this.finishBeat?.();
    });
    this.alpha = 0;
    app.renderer.on('resize', this.onResize);
    this.layout();
    this.fadedIn = new Promise((resolve) => {
      gsap.to(this, { alpha: 1, duration: scaled(storyTiming.fadeIn), onComplete: () => resolve() });
    });
  }

  private layout(): void {
    const { width, height } = this.app.screen;
    this.backdrop.clear().rect(0, 0, width, height).fill({ color: palette.void, alpha: 0.94 });
    const size = Math.min(width, height - safeArea.top - safeArea.bottom) * 0.62;
    this.stage.position.set(width / 2, safeArea.top + (height - safeArea.top - safeArea.bottom) * 0.42);
    this.line.style.wordWrapWidth = Math.min(480, width - 48);
    this.line.position.set(width / 2, this.stage.y + size * 0.62 + 24);
    this.prompt.position.set(width / 2, this.line.y + 64);
    this.skip.position.set(hud.right(width) + 12, hud.top());
  }

  private get size(): number {
    const { width, height } = this.app.screen;
    return Math.min(width, height - safeArea.top - safeArea.bottom) * 0.62;
  }

  // Resolves once the dark backdrop has faded in over the screen.
  readonly fadedIn: Promise<void>;

  // `interlude` runs after a beat of the given kind, with the story out of the way (for the
  // map's own moment, such as the colour draining when the Silence falls).
  async play(ids: SceneId[], interlude?: { after: Art['kind']; run: () => Promise<void> }): Promise<void> {
    await this.fadedIn;
    for (const id of ids) {
      for (const beat of scene(id)) {
        if (this.skipped) break;
        await this.beat(beat.line, beat.art, id === 'finale');
        if (interlude && beat.art.kind === interlude.after && !this.skipped) await interlude.run();
      }
    }
  }

  async fadeOut(): Promise<void> {
    await gsap.to(this, { alpha: 0, duration: scaled(storyTiming.fadeOut) });
  }

  private async beat(line: string, art: Parameters<typeof buildArt>[0], finale: boolean): Promise<void> {
    this.current = buildArt(art, this.size, this.hue);
    this.stage.addChild(this.current.root);
    this.current.root.alpha = 0;
    this.line.text = line;
    this.line.alpha = 0;
    // The score turns toward this beat's mood (the whole world singing at the very end).
    this.audio.storyMood(finale && art.kind === 'harmony' ? 'finale' : art.kind);
    gsap.to(this.current.root, { alpha: 1, duration: scaled(storyTiming.fadeIn) });
    gsap.to(this.line, { alpha: 0.92, duration: scaled(storyTiming.fadeIn), delay: storyTiming.lineDelay });
    // Hold for the beat, or until a tap once it has had a moment to land.
    // Wait for the player: the faint dot appears once the line has landed.
    this.tapReady = false;
    const ready = gsap.delayedCall(storyTiming.tapAfter, () => {
      this.tapReady = true;
      this.promptTween = gsap.fromTo(this.prompt, { alpha: 0 }, { alpha: storyTiming.promptAlpha, duration: storyTiming.promptBreath, yoyo: true, repeat: -1, ease: 'sine.inOut' });
    });
    await new Promise<void>((resolve) => {
      this.finishBeat = resolve;
    });
    ready.kill();
    this.promptTween?.kill();
    this.prompt.alpha = 0;
    this.finishBeat = null;
    const old = this.current;
    await gsap.to([old.root, this.line], { alpha: 0, duration: scaled(storyTiming.fadeOut) });
    old.dispose();
    this.current = null;
  }

  override destroy(): void {
    this.app.renderer.off('resize', this.onResize);
    this.current?.dispose();
    this.promptTween?.kill();
    super.destroy({ children: true });
  }
}
