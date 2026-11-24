import { describe, expect, it } from 'vitest';
import { CONTEXT_DIAGRAM } from '../src/domain';
import type { DefectKind, Point, TextGeometry } from '../src/geometry/geometry';
import { approximateTextMeasurer, buildDiagramView, createCheckLayoutStage, initialState, type LayoutState } from '../src/layout';
import { referenceTheme } from '../src/theme/theme';
import { referenceModel } from './fixtures';

const deps = { theme: referenceTheme, measurer: approximateTextMeasurer };
const p = (x: number, y: number): Point => ({ x, y });
const label = (x: number, y: number, text: string): TextGeometry => ({ x, y, lines: [text], style: 'arrowLabel', anchor: 'start' });

/** A frame with one box at (200,100)-(350,180) and whatever the test adds. */
function check(parts: Partial<LayoutState>): DefectKind[] {
  const state: LayoutState = {
    ...initialState(buildDiagramView(referenceModel(), CONTEXT_DIAGRAM)),
    frame: { x: 20, y: 20, width: 600, height: 400 },
    boxes: [{ id: 'b', number: 'A1', labelLines: [], rect: { x: 200, y: 100, width: 150, height: 80 } }],
    ...parts,
  };
  return createCheckLayoutStage(deps).run(state).defects.map((d) => d.kind);
}
const arrow = (...points: Point[]) => ({ arrowId: 'a', head: true, points });

describe('check layout', () => {
  it('passes a clean drawing, including an arrow that ends on a box edge', () => {
    expect(check({ routes: [arrow(p(20, 140), p(200, 140))], texts: [label(40, 134, 'Input')] })).toEqual([]);
  });

  it('finds an arrow through a box and an arrow outside the frame', () => {
    expect(check({ routes: [arrow(p(20, 140), p(400, 140))] })).toEqual(['arrow-through-box']);
    expect(check({ routes: [arrow(p(100, 300), p(100, 440))] })).toEqual(['arrow-outside-frame']);
  });

  it('finds a label on an arrow, on a box, on another label and outside the frame', () => {
    expect(check({ routes: [arrow(p(20, 140), p(200, 140))], texts: [label(40, 143, 'Input')] })).toEqual(['label-on-arrow']);
    expect(check({ texts: [label(180, 120, 'Overlapping')] })).toEqual(['label-on-box']);
    expect(check({ texts: [label(40, 300, 'First label'), label(60, 304, 'Second')] })).toEqual(['label-on-label']);
    expect(check({ texts: [label(580, 300, 'Runs off the edge')] })).toEqual(['label-outside-frame']);
  });

  it('reports one finding once even when several segments cause it', () => {
    const zigzag = arrow(p(20, 300), p(60, 300), p(60, 310), p(100, 310));
    expect(check({ routes: [zigzag], texts: [label(30, 308, 'A long label')] })).toEqual(['label-on-arrow']);
  });
});
