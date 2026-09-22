import { beforeEach, describe, expect, it } from 'vitest';
import { initQuality, quality, qualityStyle, sampleFrame, setQualitySetting } from './quality';

// Feeds the tier watcher a steady frame rate for a while.
function run(fps: number, seconds: number): void {
  const dt = 1 / fps;
  for (let t = 0; t < seconds; t += dt) sampleFrame(dt);
}

describe('quality tier', () => {
  beforeEach(() => {
    initQuality('high');
  });

  it('drops to low when the frame rate cannot be held', () => {
    run(30, 5);
    expect(quality()).toBe('high'); // pinned by the player, so measurement cannot move it
    setQualitySetting('auto');
    run(30, 5);
    expect(quality()).toBe('low');
  });

  it('climbs back only after a sustained good stretch', () => {
    setQualitySetting('auto');
    run(30, 5);
    expect(quality()).toBe('low');
    run(60, qualityStyle.raiseAfterSeconds * 0.5);
    expect(quality()).toBe('low');
    run(60, qualityStyle.raiseAfterSeconds * 1.5);
    expect(quality()).toBe('high');
  });

  it('ignores stalls and hidden tabs', () => {
    setQualitySetting('auto');
    for (let i = 0; i < 50; i++) sampleFrame(2); // a two-second frame proves nothing
    expect(quality()).toBe('high');
  });

  it('honours a pinned setting', () => {
    setQualitySetting('low');
    run(60, 30);
    expect(quality()).toBe('low');
    setQualitySetting('high');
    run(20, 30);
    expect(quality()).toBe('high');
  });
});
