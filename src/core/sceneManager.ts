import { Container } from 'pixi.js';
import { crossFade } from '../fx/transitions';
import { events } from './events';

export interface Scene {
  readonly container: Container;
  enter(): void;
  update?(dtSeconds: number): void;
  resize?(width: number, height: number): void;
  destroy(): void;
}

export class SceneManager {
  readonly root = new Container();
  private current: Scene | null = null;
  private chain: Promise<void> = Promise.resolve();
  private width = 0;
  private height = 0;

  get scene(): Scene | null {
    return this.current;
  }

  // Requests are serialised so a click mid-transition is honoured, not dropped.
  go(next: Scene): Promise<void> {
    this.chain = this.chain.then(() => this.transition(next));
    return this.chain;
  }

  private async transition(next: Scene): Promise<void> {
    // A new scene starts with the light in plain screen coordinates.
    events.emit('spirit:camera', { x: 0, y: 0, scale: 1 });
    const previous = this.current;
    this.current = next;
    next.resize?.(this.width, this.height);
    this.root.addChild(next.container);
    next.enter();
    await crossFade(previous?.container ?? null, next.container);
    if (previous) {
      this.root.removeChild(previous.container);
      previous.destroy();
    }
  }

  update(dtSeconds: number): void {
    this.current?.update?.(dtSeconds);
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.current?.resize?.(width, height);
  }
}
