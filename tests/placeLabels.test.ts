import { describe, expect, it } from 'vitest';
import { CONTEXT_DIAGRAM } from '../src/domain';
import type { ArrowGeometry, Point } from '../src/geometry/geometry';
import {
  approximateTextMeasurer,
  buildDiagramView,
  createCheckLayoutStage,
  createPlaceLabelsStage,
  initialState,
  referenceLayoutOptions,
  textBounds,
  type LabelAnchor,
  type LayoutState,
  type PlacedBox,
} from '../src/layout';
import { referenceTheme } from '../src/theme/theme';
import { referenceModel } from './fixtures';

const deps = { options: referenceLayoutOptions, theme: referenceTheme, measurer: approximateTextMeasurer };
const p = (x: number, y: number): Point => ({ x, y });
const box = (number: string, x: number, y: number, width = 150, height = 80): PlacedBox => ({ id: number, number, labelLines: [], rect: { x, y, width, height } });
const arrow = (arrowId: string, ...points: Point[]): ArrowGeometry => ({ arrowId, head: true, points });
const inside = (arrowId: string, text: string, point: Point): LabelAnchor => ({ arrowId, text, code: undefined, point, edge: 'none', run: 'horizontal' });

/** Places the labels, then lets the check stage judge the result. */
function place(parts: Partial<LayoutState>): LayoutState {
  const state: LayoutState = {
    ...initialState(buildDiagramView(referenceModel(), CONTEXT_DIAGRAM)),
    frame: { x: 20, y: 20, width: 900, height: 500 },
    ...parts,
  };
  return createCheckLayoutStage(deps).run(createPlaceLabelsStage(deps).run(state));
}

describe('place labels', () => {
  it('sets a label above the start of its arrow when that spot is free', () => {
    const state = place({ routes: [arrow('a', p(200, 200), p(600, 200))], anchors: [inside('a', 'Work order', p(200, 200))] });
    expect(state.texts).toEqual([{ x: 208, y: 194, lines: ['Work order'], style: 'arrowLabel', anchor: 'start' }]);
    expect(state.defects).toEqual([]);
  });

  it('moves along the arrow when another arrow crosses the preferred spot', () => {
    const state = place({
      routes: [arrow('a', p(200, 200), p(600, 200)), arrow('b', p(240, 100), p(240, 300))],
      anchors: [inside('a', 'Work order', p(200, 200))],
    });
    expect(state.defects).toEqual([]);
    expect(state.leaders).toEqual([]);
    const label = textBounds(state.texts[0]!, deps);
    expect(label.x > 240 || label.x + label.width < 240).toBe(true);
  });

  it('wraps a label or sets it beside a vertical run when a narrow gap leaves no room above', () => {
    const state = place({
      boxes: [box('A1', 100, 100), box('A2', 300, 220)],
      routes: [arrow('a', p(250, 140), p(275, 140), p(275, 260), p(300, 260))],
      anchors: [inside('a', 'Logged change request', p(250, 140))],
    });
    expect(state.defects).toEqual([]);
    expect(state.leaders).toEqual([]);
  });

  it('staggers boundary labels that would run into the next arrow', () => {
    const top = (arrowId: string, x: number, code: string): LabelAnchor => ({ arrowId, text: 'Impact analysis checklists & templates', code, point: p(x, 20), edge: 'top', run: 'vertical' });
    const state = place({
      routes: [arrow('a', p(300, 20), p(300, 300)), arrow('b', p(340, 20), p(340, 300)), arrow('c', p(380, 20), p(380, 300))],
      anchors: [top('a', 300, 'C1'), top('b', 340, 'C2'), top('c', 380, 'C3')],
    });
    expect(state.defects).toEqual([]);
    // The middle label has no room beside its arrow: its code stays, the label moves out on a leader.
    expect(state.texts.filter((t) => t.style === 'icomCode').map((t) => t.lines[0]).sort()).toEqual(['C1', 'C2', 'C3']);
    expect(state.texts.filter((t) => t.style === 'arrowLabel')).toHaveLength(3);
    expect(state.leaders).toHaveLength(1);
  });

  it('falls back to a leader line when nothing beside the arrow is free', () => {
    // A short hop between two boxes that are close together: every spot beside it is inside a box.
    const state = place({
      boxes: [box('A1', 100, 200), box('A2', 270, 200)],
      routes: [arrow('a', p(250, 240), p(270, 240))],
      anchors: [inside('a', 'Approved change request', p(250, 240))],
    });
    expect(state.leaders).toHaveLength(1);
    expect(state.leaders[0]!.to).toEqual(p(260, 240));
    expect(state.defects).toEqual([]);
  });
});
