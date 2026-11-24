import { describe, expect, it } from 'vitest';
import { CONTEXT_DIAGRAM } from '../src/domain';
import type { DiagramGeometry } from '../src/geometry/geometry';
import { referenceLayoutOptions, widenGaps, withQualityGate, type LayoutOptions, type LayoutPipeline } from '../src/layout';
import { referenceModel } from './fixtures';

const model = referenceModel();

/** A pipeline whose result depends only on the horizontal gap it was built with. */
function fake(result: (gapX: number) => { defects: number; leaders: number }): { build: (options: LayoutOptions) => LayoutPipeline; gaps: number[] } {
  const gaps: number[] = [];
  const build = (options: LayoutOptions): LayoutPipeline => ({
    stages: [],
    layout: () => {
      gaps.push(options.staircase.gapX);
      const { defects, leaders } = result(options.staircase.gapX);
      return {
        size: { width: options.staircase.gapX, height: 0 },
        defects: Array.from({ length: defects }, (_, i) => ({ kind: 'label-on-arrow', message: `defect ${i}` })),
        leaders: Array.from({ length: leaders }, () => ({ from: { x: 0, y: 0 }, to: { x: 1, y: 1 } })),
      } as unknown as DiagramGeometry;
    },
  });
  return { build, gaps };
}
const gate = (build: (options: LayoutOptions) => LayoutPipeline, maxAttempts = 4): LayoutPipeline =>
  withQualityGate(build, { baseOptions: referenceLayoutOptions, maxAttempts, relax: widenGaps });

describe('quality gate', () => {
  it('lays out once when the first drawing is clean', () => {
    const { build, gaps } = fake(() => ({ defects: 0, leaders: 0 }));
    gate(build).layout(model, CONTEXT_DIAGRAM);
    expect(gaps).toEqual([50]);
  });

  it('retries with more room and stops at the first clean drawing', () => {
    const { build, gaps } = fake((gapX) => ({ defects: gapX < 100 ? 2 : 0, leaders: 0 }));
    const result = gate(build).layout(model, CONTEXT_DIAGRAM);
    expect(gaps).toEqual([50, 75, 100]);
    expect(result.defects).toEqual([]);
  });

  it('also retries to get rid of leader lines, but never trades one for a defect', () => {
    const { build } = fake((gapX) => (gapX === 50 ? { defects: 0, leaders: 2 } : { defects: 1, leaders: 0 }));
    const result = gate(build).layout(model, CONTEXT_DIAGRAM);
    expect(result.leaders).toHaveLength(2);
    expect(result.defects).toEqual([]);
  });

  it('gives up after the allowed attempts and returns the best drawing with its defects', () => {
    const { build, gaps } = fake((gapX) => ({ defects: gapX === 75 ? 1 : 3, leaders: 0 }));
    const result = gate(build, 3).layout(model, CONTEXT_DIAGRAM);
    expect(gaps).toHaveLength(3);
    expect(result.defects).toHaveLength(1);
  });
});
