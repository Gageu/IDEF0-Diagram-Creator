import type { DiagramGeometry } from '../geometry/geometry';
import type { LayoutOptions } from './options';
import type { LayoutPipeline } from './pipeline';

export interface QualityGateConfig {
  readonly baseOptions: LayoutOptions;
  /** How many layouts to try in all, the first with the base options. */
  readonly maxAttempts: number;
  /** Options with more room than the base, for retry number `attempt` (1 for the first retry). */
  readonly relax: (base: LayoutOptions, attempt: number) => LayoutOptions;
}

/**
 * How far a drawing is from clean. A defect is always worse than a leader
 * line, which is legal IDEF0 but a sign that a label had no room.
 */
export function layoutPenalty(geometry: DiagramGeometry): number {
  return geometry.defects.length * 1000 + geometry.leaders.length;
}

/**
 * Wraps a pipeline in the quality gate: when a drawing has defects or needs
 * leader lines, lay the diagram out again with more room, and keep the best
 * attempt. Defects that survive stay on the geometry as warnings, so a bad
 * drawing is never returned silently. This loop is what stands in for manual
 * rearranging.
 */
export function withQualityGate(build: (options: LayoutOptions) => LayoutPipeline, config: QualityGateConfig): LayoutPipeline {
  const first = build(config.baseOptions);
  return {
    stages: first.stages,
    layout(model, diagramId) {
      let best = first.layout(model, diagramId);
      for (let attempt = 1; attempt < config.maxAttempts && layoutPenalty(best) > 0; attempt++) {
        const next = build(config.relax(config.baseOptions, attempt)).layout(model, diagramId);
        if (layoutPenalty(next) < layoutPenalty(best)) best = next;
      }
      return best;
    },
  };
}

/** Wider gaps between boxes and wider margins, growing with each retry. */
export function widenGaps(base: LayoutOptions, attempt: number): LayoutOptions {
  return {
    ...base,
    staircase: { gapX: base.staircase.gapX + 25 * attempt, gapY: base.staircase.gapY + 12 * attempt },
    margin: {
      left: base.margin.left + 15 * attempt,
      right: base.margin.right + 15 * attempt,
      top: base.margin.top + 15 * attempt,
      bottom: base.margin.bottom + 15 * attempt,
    },
  };
}
