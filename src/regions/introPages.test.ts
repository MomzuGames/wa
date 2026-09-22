// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';

// The instruction pages are built from plain Graphics, so they can be exercised without a
// GPU: every region, every level, every page's glyph must build and tear down cleanly.
vi.mock('../fx/glow', () => ({ createGlow: () => ({}) }));
vi.mock('../audio/engine', () => ({}));

describe('instruction pages', () => {
  it('build a glyph for every page of every level', async () => {
    const { REGION_ORDER } = await import('./catalog');
    const { getModule } = await import('./registry');
    const { palette } = await import('../design/palette');
    const { durations, easings } = await import('../design/motion');
    const { createRng } = await import('../core/rng');
    const ctx = {
      palette,
      motion: { durations, easings },
      audio: { onReady: () => {}, sfx: {} } as never,
      particles: { emit: () => {}, container: {} } as never,
      rng: createRng('intro'),
      width: 1200,
      height: 800,
    };
    for (const id of REGION_ORDER) {
      const module = getModule(id);
      for (let i = 0; i < module.levelCount; i++) {
        const scene = module.createLevel(ctx, i);
        const pages = scene.introPages?.() ?? [];
        expect(pages.length, `${id} ${i + 1}`).toBeGreaterThan(0);
        for (const page of pages) {
          expect(page.caption.length).toBeGreaterThan(10);
          const glyph = page.glyph();
          expect(glyph.children.length).toBeGreaterThan(0);
          glyph.destroy({ children: true });
        }
        scene.destroy();
      }
    }
  });
});
