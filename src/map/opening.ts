import gsap from 'gsap';
import { Container, Graphics, Text } from 'pixi.js';
import { palette, type PaletteToken } from '../design/palette';
import { easings, scaled, storyTiming } from '../design/motion';
import { hud, safeArea } from '../design/layout';
import { REGION_ORDER } from '../regions/catalog';
import { StoryLight } from '../story/art';
import { familyColor } from '../story/family';
import type { AudioEngine } from '../audio/engine';
import type { WorldMapScene } from './worldMap';
import { openingLines } from './openingLines';

// The opening, told on the world map itself: the seven lights dance over a bright world;
// the Silence falls (the music cuts out, a dark wave rolls out, every colour drains); the
// lights panic; six fly off, one to each land, and sink in asleep; the smallest is left
// behind, alone, and sets out to bring the song back. One line of text per beat, a tap
// moves on, Skip ends it.


const openingStyle = {
  lightRadius: 13,
  littleShare: 0.72, // the player's light is the smallest
  danceRadius: 0.17, // of the shorter screen side
  danceSpeed: 0.9,
  shockSeconds: 1.4,
  panicHop: [0.3, 0.6], // seconds between darts
  flySeconds: 1.6,
  flyStagger: 0.55,
  captionBottom: 150, // px above the bottom safe area
} as const;

export class OpeningCinematic {
  private lights: StoryLight[] = [];
  private little: StoryLight;
  private layer = new Container(); // in the map's world, moving with it
  private overlay = new Container(); // on the screen: caption, prompt, skip, shockwave
  private caption: Text;
  private prompt = new Graphics();
  private skipText: Text;
  private shock = new Graphics();
  private hit = new Graphics();
  private mode: 'dance' | 'still' | 'panic' | 'away' = 'dance';
  private time = 0;
  private tick = () => this.update(gsap.ticker.deltaRatio() / 60);
  private tapReady = false;
  private onTap: (() => void) | null = null;
  private skipped = false;
  private panicTimers: gsap.core.Tween[] = [];
  private centre: { x: number; y: number };

  constructor(
    private map: WorldMapScene,
    hue: PaletteToken,
    private audio: AudioEngine,
    private width: number,
    private height: number,
  ) {
    this.centre = map.centreLocal(); // measured again when play() begins
    const family = REGION_ORDER.map((id) => familyColor(id, hue));
    this.little = new StoryLight(hue, openingStyle.lightRadius * openingStyle.littleShare, false, true);
    this.lights = family.map((token) => new StoryLight(token, openingStyle.lightRadius, false));
    for (const l of [...this.lights, this.little]) {
      l.position.set(this.centre.x, this.centre.y);
      l.alpha = 0;
      this.layer.addChild(l);
    }
    this.layer.eventMode = 'none';
    map.addToWorld(this.layer);

    this.caption = new Text({
      text: '',
      style: { fontFamily: 'Quicksand', fontWeight: '300', fontSize: 19, letterSpacing: 1.5, fill: palette.pearl, align: 'center', wordWrap: true, wordWrapWidth: Math.min(460, width - 48) },
      resolution: window.devicePixelRatio || 1,
    });
    this.caption.anchor.set(0.5);
    this.caption.position.set(width / 2, height - safeArea.bottom - openingStyle.captionBottom);
    this.caption.alpha = 0;
    this.prompt.circle(0, 0, 3).fill({ color: palette.pearl });
    this.prompt.position.set(width / 2, this.caption.y + 52);
    this.prompt.alpha = 0;
    this.skipText = new Text({ text: 'Skip', style: { fontFamily: 'Quicksand', fontWeight: '300', fontSize: 14, letterSpacing: 2, fill: palette.pearl }, resolution: window.devicePixelRatio || 1 });
    this.skipText.anchor.set(1, 0.5);
    this.skipText.position.set(hud.right(width) + 12, hud.top());
    this.skipText.alpha = 0.45;
    this.skipText.eventMode = 'static';
    this.skipText.cursor = 'pointer';
    this.skipText.on('pointertap', (e) => {
      e.stopPropagation();
      this.skipped = true;
      this.onTap?.();
    });
    this.hit.rect(0, 0, width, height).fill({ color: palette.void, alpha: 0.001 });
    this.hit.eventMode = 'static';
    this.hit.on('pointertap', () => {
      if (this.tapReady) this.onTap?.();
    });
    this.shock.eventMode = 'none';
    // A soft dark band behind the words, so they read over the lands' names.
    const band = new Graphics();
    band.eventMode = 'none';
    for (const [h, al] of [[150, 0.25], [110, 0.35], [80, 0.4]] as const) band.rect(0, this.caption.y - h / 2, width, h).fill({ color: palette.void, alpha: al });
    this.overlay.addChild(this.shock, band, this.hit, this.caption, this.prompt, this.skipText);
    map.addOverlay(this.overlay);
    gsap.ticker.add(this.tick);
  }

  // Plays the whole opening. Resolves with where the little light ended up (screen
  // coordinates), so the companion light can take its place.
  async play(): Promise<{ x: number; y: number }> {
    // The map takes its size as it comes on screen; start from its real middle.
    this.centre = this.map.centreLocal();
    for (const l of [...this.lights, this.little]) l.position.set(this.centre.x, this.centre.y);
    // 1. The world as it was: bright, in colour, the family dancing.
    this.map.brightNow();
    for (const l of [...this.lights, this.little]) gsap.to(l, { alpha: 1, duration: 0.8 });
    this.audio.storyMood('harmony');
    await this.beat(0);
    // 2. The Silence falls.
    if (!this.skipped) {
      this.silence();
      await this.beat(1, 2.6);
    }
    // 3. Panic.
    if (!this.skipped) {
      this.audio.storyMood('panic');
      this.startPanic();
      await this.beat(2);
    }
    // 4. One to each land.
    if (!this.skipped) {
      this.stopPanic();
      this.audio.storyMood('depart');
      const flights = this.depart();
      await this.beat(3, openingStyle.flyStagger * 6 + openingStyle.flySeconds);
      await flights;
    }
    // 5. Left behind.
    if (!this.skipped) {
      this.audio.storyMood('wake');
      this.alone();
      await this.beat(4);
    }
    // 6. It sets out.
    if (!this.skipped) {
      this.audio.storyMood('home');
      this.resolve();
      await this.beat(5);
    }
    if (this.skipped) this.skipToEnd();
    await gsap.to(this.caption, { alpha: 0, duration: scaled(storyTiming.fadeOut) });
    const p = this.little.getGlobalPosition();
    return { x: p.x, y: p.y };
  }

  // One line of the story: it fades in, and once it has landed a tap moves on.
  private async beat(i: number, minSeconds: number = storyTiming.tapAfter): Promise<void> {
    if (this.caption.alpha > 0) await gsap.to(this.caption, { alpha: 0, duration: scaled(storyTiming.fadeOut) });
    this.caption.text = openingLines[i]!;
    gsap.to(this.caption, { alpha: 0.92, duration: scaled(storyTiming.fadeIn), delay: storyTiming.lineDelay });
    this.tapReady = false;
    const breath = gsap.delayedCall(minSeconds, () => {
      this.tapReady = true;
      gsap.fromTo(this.prompt, { alpha: 0 }, { alpha: storyTiming.promptAlpha, duration: storyTiming.promptBreath, yoyo: true, repeat: -1, ease: 'sine.inOut' });
    });
    await new Promise<void>((resolve) => (this.onTap = resolve));
    breath.kill();
    gsap.killTweensOf(this.prompt);
    this.prompt.alpha = 0;
    this.tapReady = false;
    this.onTap = null;
  }

  private update(dt: number): void {
    this.time += dt;
    if (this.mode !== 'dance') return;
    // Seven lights circling and weaving around the middle of the world, the smallest within.
    const R = Math.min(this.width, this.height) * openingStyle.danceRadius;
    this.lights.forEach((l, i) => {
      const a = this.time * openingStyle.danceSpeed + (i / this.lights.length) * Math.PI * 2;
      const r = R * (1 + 0.18 * Math.sin(this.time * 1.3 + i));
      l.position.set(this.centre.x + Math.cos(a) * r, this.centre.y + Math.sin(a) * r * 0.75 + Math.sin(this.time * 3 + i) * 5);
    });
    const a = -this.time * openingStyle.danceSpeed * 1.4;
    this.little.position.set(this.centre.x + Math.cos(a) * R * 0.35, this.centre.y + Math.sin(a) * R * 0.3 + Math.sin(this.time * 3.4) * 4);
    if (Math.random() < dt * 0.4) this.lights[Math.floor(Math.random() * this.lights.length)]!.face?.squint(0.5);
  }

  // The Silence: the music cuts out, a dark wave rolls out from the middle, every land
  // flickers and loses its colour at once, the stars go out and the lights freeze.
  private silence(): void {
    this.mode = 'still';
    this.audio.storyHush();
    const reach = Math.hypot(this.width, this.height);
    const wave = { p: 0 };
    gsap.to(wave, {
      p: 1,
      duration: scaled(openingStyle.shockSeconds),
      ease: 'power2.out',
      onUpdate: () => {
        const c = this.map.centreScreen();
        this.shock.clear();
        this.shock.circle(c.x, c.y, wave.p * reach).stroke({ color: palette.void, width: 120 * (1 - wave.p) + 20, alpha: 0.75 * (1 - wave.p) });
        this.shock.circle(c.x, c.y, wave.p * reach).stroke({ color: palette.pearl, width: 2, alpha: 0.35 * (1 - wave.p) });
      },
      onComplete: () => this.shock.clear(),
    });
    this.map.drainNow();
    for (const l of [...this.lights, this.little]) {
      gsap.to(l, { alpha: 0.6, duration: 0.5 });
      gsap.fromTo(l, { x: l.x - 2 }, { x: l.x + 2, duration: 0.05, yoyo: true, repeat: 7, ease: 'none' });
      l.face?.lookAt(0, -1);
    }
    gsap.delayedCall(1.6, () => {
      if (!this.skipped) this.audio.storyMood('silence');
    });
  }

  // Panic: the lights dart this way and that, looking everywhere at once.
  private startPanic(): void {
    this.mode = 'panic';
    const R = Math.min(this.width, this.height) * openingStyle.danceRadius * 1.3;
    for (const l of [...this.lights, this.little]) {
      gsap.to(l, { alpha: 0.85, duration: 0.3 });
      const dart = () => {
        if (this.mode !== 'panic') return;
        const a = Math.random() * Math.PI * 2;
        const r = R * (0.2 + Math.random() * (l === this.little ? 0.4 : 0.8));
        gsap.to(l, { x: this.centre.x + Math.cos(a) * r, y: this.centre.y + Math.sin(a) * r * 0.75, duration: 0.28, ease: 'power2.out' });
        l.face?.lookAt(Math.random() * 2 - 1, Math.random() * 2 - 1);
        if (Math.random() < 0.3) l.face?.blink();
        const [lo, hi] = openingStyle.panicHop;
        this.panicTimers.push(gsap.delayedCall(lo + Math.random() * (hi - lo), dart));
      };
      dart();
    }
  }

  private stopPanic(): void {
    this.mode = 'away';
    this.panicTimers.forEach((t) => t.kill());
    this.panicTimers = [];
  }

  // One after another the family flies to the lands, glows there a last time and sinks in
  // asleep, while the smallest watches each go.
  private depart(): Promise<void> {
    gsap.to(this.little, { x: this.centre.x, y: this.centre.y, duration: 0.8, ease: easings.ambient });
    return Promise.all(
      REGION_ORDER.map(
        (id, i) =>
          new Promise<void>((resolve) => {
            const l = this.lights[i]!;
            const to = this.map.landLocal(id);
            const delay = i * openingStyle.flyStagger;
            gsap.delayedCall(delay, () => this.little.face?.lookAt(Math.sign(to.x - this.centre.x) || 0.01, Math.max(-1, Math.min(1, (to.y - this.centre.y) / 200))));
            gsap.to(l, { x: to.x, duration: scaled(openingStyle.flySeconds), delay, ease: 'sine.inOut' });
            gsap.to(l, {
              y: to.y,
              duration: scaled(openingStyle.flySeconds),
              delay,
              ease: 'sine.in',
              onComplete: () => {
                this.map.lightLanded(id);
                l.sleep();
                gsap.to(l, { alpha: 0, duration: 0.9, delay: 0.4 });
                gsap.to(l.scale, { x: 0.4, y: 0.4, duration: 1.3, onComplete: () => resolve() });
              },
            });
          }),
      ),
    ).then(() => undefined);
  }

  // Alone: the little light looks around, small and dim.
  private alone(): void {
    const l = this.little;
    gsap.to(l, { alpha: 0.75, duration: 1 });
    gsap.to(l.scale, { x: 0.9, y: 0.9, duration: 1 });
    gsap.delayedCall(0.4, () => l.face?.lookAt(-1, 0.2));
    gsap.delayedCall(1.5, () => l.face?.lookAt(1, 0.2));
    gsap.delayedCall(2.6, () => l.face?.lookAt(0, 0.6));
  }

  // It gathers itself up and brightens: it will bring them back.
  private resolve(): void {
    const l = this.little;
    gsap.to(l, { alpha: 1, duration: 0.6 });
    gsap.to(l.scale, { x: 1.15, y: 1.15, duration: 0.5, yoyo: true, repeat: 1, ease: 'sine.out' });
    l.face?.lookAt(0, -0.6);
    gsap.delayedCall(0.6, () => l.face?.squint(0.8));
  }

  // Skip: straight to the end state (the world grey, the family gone into the lands).
  private skipToEnd(): void {
    this.stopPanic();
    gsap.killTweensOf(this.lights);
    this.map.drainNow(true);
    for (const id of REGION_ORDER) this.map.lightLanded(id, true);
    for (const l of this.lights) l.alpha = 0;
    this.little.position.set(this.centre.x, this.centre.y);
    this.little.alpha = 1;
    this.little.scale.set(1);
    this.audio.storyMood('wake');
  }

  destroy(): void {
    gsap.ticker.remove(this.tick);
    this.stopPanic();
    for (const l of this.lights) {
      gsap.killTweensOf(l);
      gsap.killTweensOf(l.scale);
    }
    gsap.killTweensOf(this.little);
    gsap.killTweensOf(this.caption);
    gsap.killTweensOf(this.prompt);
    this.layer.destroy({ children: true });
    this.overlay.destroy({ children: true });
  }
}
