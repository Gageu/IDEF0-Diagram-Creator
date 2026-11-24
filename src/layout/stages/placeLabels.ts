import { bottom, right, type TextGeometry } from '../../geometry/geometry';
import { verticalLabelLines, type LayoutDeps } from '../boundaryLabel';
import type { LayoutStage } from '../state';

/**
 * Stage 6, first version: puts each label at a fixed spot relative to its
 * anchor, and each ICOM code at the frame edge. It does not yet look for
 * collisions; that is the label placer of a later milestone.
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
      const add = (x: number, y: number, lines: string[], anchor: 'start' | 'end', style: 'arrowLabel' | 'icomCode' = 'arrowLabel'): void => {
        if (lines.some((line) => line !== '')) texts.push({ x, y, lines, style, anchor });
      };

      for (const a of state.anchors) {
        const { x, y } = a.point;
        const code = a.code === undefined ? [] : [a.code];
        if (a.edge === 'right') {
          const baseline = y - lineGap + 1;
          add(right(frame) - codeOffset, baseline, code, 'end', 'icomCode');
          add(right(frame) - codeOffset - codeWidth - 4, baseline, [a.text], 'end');
        } else if (a.edge === 'left') {
          add(x + codeOffset, y - lineGap, code, 'start', 'icomCode');
          add(x + codeOffset + codeWidth, y - lineGap, [a.text], 'start');
        } else if (a.edge === 'top' || a.edge === 'bottom') {
          const baseline = a.edge === 'top' ? frame.y + topLabelDrop : bottom(frame) - bottomLabelRise;
          add(x + codeOffset, baseline, code, 'start', 'icomCode');
          add(x + codeOffset + codeWidth, baseline, verticalLabelLines(a.text, deps), 'start');
        } else if (a.run === 'horizontal') {
          add(x + 8, y - lineGap, [a.text], 'start');
        } else {
          add(x + codeOffset, y, verticalLabelLines(a.text, deps), 'start');
        }
      }
      return { ...state, texts: [...state.texts, ...texts] };
    },
  };
}
