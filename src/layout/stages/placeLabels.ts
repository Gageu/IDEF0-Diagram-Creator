import { bottom, right, type TextGeometry } from '../../geometry/geometry';
import { verticalLabelLines, type LayoutDeps } from '../boundaryLabel';
import type { LayoutStage } from '../state';

/**
 * Stage 6, first version: puts each arrow's label at a fixed spot relative to
 * where the arrow starts or ends, and each ICOM code at the frame edge. It
 * does not yet look for collisions; that is the label placer of a later
 * milestone.
 */
export function createPlaceLabelsStage(deps: LayoutDeps): LayoutStage {
  const { codeOffset, codeWidth, lineGap } = deps.options.label;
  /** Baseline of the first label line beside a vertical boundary arrow, measured from the frame edge. */
  const topLabelDrop = 30;
  const bottomLabelRise = 60;

  return {
    name: 'place-labels',
    run(state) {
      const { frame } = state;
      const texts: TextGeometry[] = [];
      const labelled = new Set<string>();
      const coded = new Set<string>();
      const code = (value: string | undefined, x: number, y: number, anchor: 'start' | 'end'): void => {
        if (value === undefined || coded.has(value)) return;
        coded.add(value);
        texts.push({ x, y, lines: [value], style: 'icomCode', anchor });
      };

      for (const c of state.connections) {
        // A branching arrow is labelled once, on its first run.
        const label = labelled.has(c.arrowId) || c.label === '' ? undefined : c.label;
        labelled.add(c.arrowId);
        const add = (x: number, y: number, lines: string[], anchor: 'start' | 'end'): void => {
          if (label !== undefined) texts.push({ x, y, lines, style: 'arrowLabel', anchor });
        };
        const { x, y } = c.from.point;

        if (c.toBoundary) {
          const baseline = c.to.point.y - lineGap + 1;
          code(c.toBoundary.code, right(frame) - codeOffset, baseline, 'end');
          add(right(frame) - codeOffset - codeWidth - 4, baseline, [c.label], 'end');
        } else if (c.fromBoundary?.side === 'left') {
          code(c.fromBoundary.code, x + codeOffset, y - lineGap, 'start');
          add(x + codeOffset + codeWidth, y - lineGap, [c.label], 'start');
        } else if (c.fromBoundary) {
          const baseline = c.fromBoundary.side === 'top' ? frame.y + topLabelDrop : bottom(frame) - bottomLabelRise;
          code(c.fromBoundary.code, x + codeOffset, baseline, 'start');
          add(x + codeOffset + codeWidth, baseline, verticalLabelLines(c.label, deps), 'start');
        } else {
          add(x + 8, y - lineGap, [c.label], 'start');
        }
      }
      return { ...state, texts: [...state.texts, ...texts] };
    },
  };
}
