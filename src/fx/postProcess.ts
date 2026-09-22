import { ColorMatrixFilter, Container, type Filter, NoiseFilter } from 'pixi.js';
import { AdvancedBloomFilter } from 'pixi-filters';
import { events } from '../core/events';
import { isHigh } from '../design/quality';

// One pass over the whole game: light that spills from bright shapes (bloom), a gentle
// colour grade, and a film grain. On the low tier the stack is empty, so a slow phone
// renders exactly what it did before any of this existed.
export const postStyle = {
  bloomThreshold: 0.55, // only pastel light blooms; the near-black background does not
  bloomScale: 0.62,
  bloomBrightness: 1.0,
  bloomBlur: 6,
  bloomQuality: 3,
  grain: 0.55,
  saturation: 1.06,
  contrast: 0.04,
  // A trace of blue lifted into the shadows: the night reads colder, the pastels warmer.
  shadowTint: 0.03,
} as const;

function buildGrade(): ColorMatrixFilter {
  const grade = new ColorMatrixFilter();
  grade.saturate(postStyle.saturation - 1, true);
  grade.contrast(postStyle.contrast, true);
  // Lift the blue channel slightly in the darks (the last column is the offset).
  const m = grade.matrix.slice();
  m[19] = (m[19] ?? 0) + postStyle.shadowTint;
  grade.matrix = m as typeof grade.matrix;
  return grade;
}

export class PostProcess {
  private filters: Filter[] = [];
  private unsubscribe: () => void;

  constructor(private target: Container) {
    this.unsubscribe = events.on('quality:changed', () => this.rebuild());
    this.rebuild();
  }

  private rebuild(): void {
    for (const f of this.filters) f.destroy();
    this.filters = [];
    if (!isHigh()) {
      this.target.filters = [];
      return;
    }
    const bloom = new AdvancedBloomFilter({
      threshold: postStyle.bloomThreshold,
      bloomScale: postStyle.bloomScale,
      brightness: postStyle.bloomBrightness,
      blur: postStyle.bloomBlur,
      quality: postStyle.bloomQuality,
    });
    bloom.resolution = 'inherit';
    const grade = buildGrade();
    const grain = new NoiseFilter({ noise: postStyle.grain / 10, seed: Math.random() });
    this.filters = [bloom, grade, grain];
    this.target.filters = this.filters;
  }

  // The grain has to crawl, or it looks like dirt on the screen rather than film.
  update(): void {
    if (!isHigh()) return;
    const grain = this.filters[2] as NoiseFilter | undefined;
    if (grain) grain.seed = Math.random();
  }

  destroy(): void {
    this.unsubscribe();
    this.target.filters = [];
    for (const f of this.filters) f.destroy();
    this.filters = [];
  }
}
