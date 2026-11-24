import { describe, expect, it } from 'vitest';
import { createDrawDiagram, createPipeline, loadRouter, naiveRouter } from '../src/app/composition';
import { CONTEXT_DIAGRAM, diagramIds, diagramNode } from '../src/domain';
import { bottom, right, type DiagramGeometry, type Point, type Rect } from '../src/geometry/geometry';
import { approximateTextMeasurer, wrapText } from '../src/layout';
import { referenceTheme } from '../src/theme/theme';
import { referenceModel } from './fixtures';

const model = referenceModel();
const router = await loadRouter();
const layoutPipeline = createPipeline(router);
const drawDiagram = createDrawDiagram(router);

function segments(points: readonly Point[]): [Point, Point][] {
  return points.slice(1).map((p, i) => [points[i]!, p]);
}

/** True when an axis-aligned segment passes through the inside of a rectangle. */
function crossesInside([a, b]: [Point, Point], r: Rect): boolean {
  const [x0, x1, y0, y1] = [Math.min(a.x, b.x), Math.max(a.x, b.x), Math.min(a.y, b.y), Math.max(a.y, b.y)];
  return x1 > r.x && x0 < right(r) && y1 > r.y && y0 < bottom(r);
}

function segmentsCross([a, b]: [Point, Point], [c, d]: [Point, Point]): boolean {
  const horizontal = (p: Point, q: Point): boolean => p.y === q.y;
  if (horizontal(a, b) === horizontal(c, d)) return false;
  const [h, v] = horizontal(a, b) ? [[a, b], [c, d]] : [[c, d], [a, b]];
  const within = (value: number, p: number, q: number): boolean => value > Math.min(p, q) && value < Math.max(p, q);
  return within(v![0]!.x, h![0]!.x, h![1]!.x) && within(h![0]!.y, v![0]!.y, v![1]!.y);
}

describe('wrapText', () => {
  const measure = (line: string): number => approximateTextMeasurer.width(line, referenceTheme.text.boxLabel);
  it('uses the fewest lines, then balances them', () => {
    expect(wrapText('Manage Requirement Change Requests', 236, measure)).toEqual(['Manage Requirement', 'Change Requests']);
    expect(wrapText('Verify Change', 126, measure)).toEqual(['Verify Change']);
    expect(wrapText('', 100, measure)).toEqual([]);
  });
});

describe('A-0 context diagram of the reference model', () => {
  const g = layoutPipeline.layout(model, CONTEXT_DIAGRAM);
  const box = g.boxes[0]!;
  const texts = g.texts.flatMap((t) => t.lines);

  it('has the reference canvas, frame, footer and one centred box', () => {
    expect(g.size).toEqual({ width: 1100, height: 624 });
    expect(g.frame).toEqual({ x: 20, y: 20, width: 1060, height: 540 });
    expect(g.footer).toEqual({ node: 'A-0', title: 'Manage Requirement Change Requests', number: 'CC-01' });
    expect(g.boxes).toHaveLength(1);
    expect(box).toMatchObject({ number: 'A0', labelLines: ['Manage Requirement', 'Change Requests'], rect: { width: 260, height: 140 } });
  });

  it('brings each role in on its own side (rule B3)', () => {
    const entering = (side: (end: Point, prev: Point) => boolean): number =>
      g.arrows.filter((a) => side(a.points[a.points.length - 1]!, a.points[a.points.length - 2]!)).length;
    expect(entering((end, prev) => end.x === box.rect.x && prev.x < end.x)).toBe(3); // inputs, left
    expect(entering((end, prev) => end.y === box.rect.y && prev.y < end.y)).toBe(5); // controls, top
    expect(entering((end, prev) => end.y === bottom(box.rect) && prev.y > end.y)).toBe(2); // mechanisms, bottom
    expect(g.arrows.filter((a) => a.points[0]!.x === right(box.rect) && a.points[a.points.length - 1]!.x === right(g.frame))).toHaveLength(5); // outputs, right
  });

  it('labels every arrow once and shows all fifteen ICOM codes', () => {
    const codes = g.texts.filter((t) => t.style === 'icomCode').map((t) => t.lines[0]);
    expect(codes.sort()).toEqual(['C1', 'C2', 'C3', 'C4', 'C5', 'I1', 'I2', 'I3', 'M1', 'M2', 'O1', 'O2', 'O3', 'O4', 'O5']);
    expect(g.texts.filter((t) => t.style === 'arrowLabel')).toHaveLength(15);
    expect(texts).toContain('Change proposal');
    expect(texts.some((line) => line.startsWith('Purpose: '))).toBe(true);
  });

  it('fans the controls out for their labels without any two arrows crossing', () => {
    const controls = g.arrows.filter((a) => a.points[0]!.y === g.frame.y);
    const crossings = controls.flatMap((a, i) =>
      controls.slice(i + 1).filter((b) => segments(a.points).some((s) => segments(b.points).some((t) => segmentsCross(s, t)))),
    );
    expect(crossings).toEqual([]);
    const xs = controls.map((a) => a.points[0]!.x);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
    expect(Math.min(...xs.slice(1).map((x, i) => x - xs[i]!))).toBeGreaterThan(100);
  });
});

describe('A0 diagram of the reference model', () => {
  const g = layoutPipeline.layout(model, model.rootId);
  const crossings = (edge: (p: Point) => boolean): number => g.arrows.filter((a) => edge(a.points[0]!) || edge(a.points[a.points.length - 1]!)).length;

  it('brings each boundary arrow across the frame exactly once', () => {
    expect(crossings((p) => p.x === g.frame.x)).toBe(3); // I1..I3, though I3 feeds two boxes
    expect(crossings((p) => p.y === g.frame.y)).toBe(5); // C1..C5, though C3 feeds two boxes
    expect(crossings((p) => p.y === bottom(g.frame))).toBe(2); // M1 feeds six boxes, M2 splits into five roles
    expect(crossings((p) => p.x === right(g.frame))).toBe(5); // O1..O5
  });

  it('shows each ICOM code once and labels each role of the split mechanism', () => {
    const codes = g.texts.filter((t) => t.style === 'icomCode').map((t) => t.lines[0]);
    expect(codes).toHaveLength(15);
    expect(new Set(codes).size).toBe(15);
    const labels = g.texts.filter((t) => t.style === 'arrowLabel').map((t) => t.lines.join(' '));
    expect(labels).toEqual(expect.arrayContaining(['Change control roles', 'Originator & Request Receiver', 'Evaluator', 'CCB', 'Modifier', 'Verifier']));
    expect(labels.filter((l) => l === 'RM tool')).toHaveLength(1);
  });

  it('gives every box side its arrowheads', () => {
    const heads = g.arrows.filter((a) => a.head).length;
    // 15 box-to-box and boundary-to-box ends, 5 outputs to the frame, 6 + 5 mechanism branches... counted from the model:
    const ends = model.arrows.filter((a) => a.diagramId === model.rootId).reduce((n, a) => n + a.targets.length * a.sources.length, 0);
    expect(heads).toBe(ends);
  });
});

describe.each(diagramIds(model).map((id) => [diagramNode(model, id), id] as const))('diagram %s', (node, id) => {
  const g: DiagramGeometry = layoutPipeline.layout(model, id);

  it('passes the quality gate: no defects and no leader lines', () => {
    expect(g.defects).toEqual([]);
    expect(g.leaders).toEqual([]);
  });

  it('keeps every arrow orthogonal, inside the frame and out of every box', () => {
    for (const arrow of g.arrows) {
      for (const segment of segments(arrow.points)) {
        const [a, b] = segment;
        expect(a.x === b.x || a.y === b.y, `diagonal in ${arrow.arrowId}`).toBe(true);
        expect(g.boxes.filter((box) => crossesInside(segment, box.rect)).map((box) => box.number), `arrow ${arrow.arrowId}`).toEqual([]);
      }
      for (const p of arrow.points) {
        expect(p.x >= g.frame.x && p.x <= right(g.frame) && p.y >= g.frame.y && p.y <= bottom(g.frame), `arrow ${arrow.arrowId} leaves the frame`).toBe(true);
      }
    }
  });

  it('never runs two different arrows along the same line', () => {
    const overlaps: string[] = [];
    const runs = g.arrows.flatMap((a) => segments(a.points).map((s) => ({ id: a.arrowId, s })));
    runs.forEach((p, i) => {
      for (const q of runs.slice(i + 1)) {
        if (p.id === q.id) continue;
        for (const [fixed, along] of [['x', 'y'], ['y', 'x']] as const) {
          const collinear = p.s[0][fixed] === p.s[1][fixed] && q.s[0][fixed] === q.s[1][fixed] && p.s[0][fixed] === q.s[0][fixed];
          const shared = Math.min(Math.max(p.s[0][along], p.s[1][along]), Math.max(q.s[0][along], q.s[1][along])) - Math.max(Math.min(p.s[0][along], p.s[1][along]), Math.min(q.s[0][along], q.s[1][along]));
          if (collinear && shared > 0) overlaps.push(`${p.id} and ${q.id} share ${shared}px at ${fixed}=${p.s[0][fixed]}`);
        }
      }
    });
    expect(overlaps).toEqual([]);
  });

  it('sets the boxes in a staircase without overlap (rule D1)', () => {
    g.boxes.slice(1).forEach((box, i) => {
      const previous = g.boxes[i]!;
      expect(box.rect.x).toBeGreaterThan(right(previous.rect));
      expect(box.rect.y).toBeGreaterThan(bottom(previous.rect));
    });
    for (const box of g.boxes) {
      expect(box.rect.x > g.frame.x && right(box.rect) < right(g.frame) && box.rect.y > g.frame.y && bottom(box.rect) < bottom(g.frame)).toBe(true);
    }
  });

  it('is deterministic and matches its SVG snapshot', async () => {
    const svg = drawDiagram(model, id);
    expect(drawDiagram(model, id)).toBe(svg);
    await expect(svg).toMatchFileSnapshot(`./__snapshots__/${node}.svg`);
  });
});

describe('redraw speed', () => {
  it('lays out and renders the six-box A0 diagram well inside the 500 ms budget', () => {
    drawDiagram(model, model.rootId); // warm up
    const started = performance.now();
    drawDiagram(model, model.rootId);
    expect(performance.now() - started).toBeLessThan(500);
  });
});

describe('with the naive router', () => {
  it('still draws every diagram, so the pipeline does not depend on one router', () => {
    const draw = createDrawDiagram(naiveRouter());
    for (const id of diagramIds(model)) expect(draw(model, id)).toContain('</svg>');
  });
});
