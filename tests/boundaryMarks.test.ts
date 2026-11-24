import { describe, expect, it } from 'vitest';
import { createPipeline, loadRouter } from '../src/app/composition';
import { addArrow, addFunction, CONTEXT_DIAGRAM, createModel, type Command, type Model } from '../src/domain';
import { bottom, right } from '../src/geometry/geometry';

const pipeline = createPipeline(await loadRouter());

/** A0 with one arrow per side, decomposed into three boxes that are not wired up yet. */
function unwired(): Model {
  const external = (id: string, role: 'input' | 'control' | 'mechanism'): Command =>
    addArrow({ id, diagramId: CONTEXT_DIAGRAM, label: `Outside ${role}`, sources: [{ kind: 'boundary', link: { kind: 'external', role } }], targets: [{ kind: 'function', functionId: 'root', role }] });
  const commands: Command[] = [
    external('in', 'input'),
    external('rule', 'control'),
    external('tool', 'mechanism'),
    addArrow({ id: 'out', diagramId: CONTEXT_DIAGRAM, label: 'Finished product', sources: [{ kind: 'function', functionId: 'root' }], targets: [{ kind: 'boundary', link: { kind: 'external' } }] }),
    ...['f1', 'f2', 'f3'].map((id, i) => addFunction({ parentId: 'root', id, label: `Perform Step ${i + 1}` })),
  ];
  return commands.reduce((model, command) => command.apply(model), createModel({ rootId: 'root', rootLabel: 'Make Product' }));
}

describe('unconnected parent arrows', () => {
  it('are drawn dashed at the frame edge of their role, with code and label, and cause no defects', () => {
    const g = pipeline.layout(unwired(), 'root');
    const stubs = g.arrows.filter((a) => a.dashed);
    expect(stubs.map((s) => s.arrowId).sort()).toEqual(['in', 'out', 'rule', 'tool']);
    const stub = (id: string) => stubs.find((s) => s.arrowId === id)!.points;
    expect(stub('in')[0]!.x).toBe(g.frame.x);
    expect(stub('rule')[0]!.y).toBe(g.frame.y);
    expect(stub('tool')[0]!.y).toBe(bottom(g.frame));
    expect(stub('out')[1]!.x).toBe(right(g.frame));
    const labels = g.texts.flatMap((t) => t.lines);
    expect(labels).toEqual(expect.arrayContaining(['I1', 'Outside input', 'C1', 'M1', 'O1', 'Finished product']));
    expect(g.defects).toEqual([]);
  });

  it('disappear once a child arrow carries the parent arrow in', () => {
    const model = addArrow({ diagramId: 'root', label: 'Outside input', sources: [{ kind: 'boundary', link: { kind: 'inherited', parentArrowId: 'in' } }], targets: [{ kind: 'function', functionId: 'f1', role: 'input' }] }).apply(unwired());
    const g = pipeline.layout(model, 'root');
    expect(g.arrows.filter((a) => a.dashed).map((s) => s.arrowId).sort()).toEqual(['out', 'rule', 'tool']);
    expect(g.arrows.some((a) => !a.dashed)).toBe(true);
  });

  it('keep clear of arrows that already cross the same edge', () => {
    const model = addArrow({ diagramId: 'root', label: 'Local rule', sources: [{ kind: 'boundary', link: { kind: 'tunneled', role: 'control' } }], targets: [{ kind: 'function', functionId: 'f2', role: 'control' }] }).apply(unwired());
    const g = pipeline.layout(model, 'root');
    const solid = g.arrows.find((a) => !a.dashed)!;
    const stub = g.arrows.find((a) => a.arrowId === 'rule')!;
    expect(Math.abs(stub.points[0]!.x - solid.points[0]!.x)).toBeGreaterThanOrEqual(20);
    expect(g.defects).toEqual([]);
  });
});

describe('tunneled arrows', () => {
  it('get a tunnel mark where they cross the frame, and no ICOM code', () => {
    const model = [
      addArrow({ id: 'local', diagramId: 'root', label: 'Local rule', sources: [{ kind: 'boundary', link: { kind: 'tunneled', role: 'control' } }], targets: [{ kind: 'function', functionId: 'f2', role: 'control' }] }),
      addArrow({ id: 'scrap', diagramId: 'root', label: 'Scrap', sources: [{ kind: 'function', functionId: 'f3' }], targets: [{ kind: 'boundary', link: { kind: 'tunneled' } }] }),
    ].reduce((m, c) => c.apply(m), unwired());
    const g = pipeline.layout(model, 'root');
    expect(g.tunnels).toHaveLength(2);
    const [top, exit] = [g.tunnels.find((t) => t.run === 'vertical')!, g.tunnels.find((t) => t.run === 'horizontal')!];
    expect(top.at.y).toBe(g.frame.y);
    expect(top.inward).toEqual({ x: 0, y: 1 });
    expect(exit.at.x).toBe(right(g.frame));
    expect(exit.inward).toEqual({ x: -1, y: 0 });
    const scrap = g.texts.find((t) => t.lines.includes('Scrap'))!;
    expect(scrap.arrowId).toBe('scrap');
    expect(g.defects).toEqual([]);
  });

  it('the reference diagrams have none', () => {
    expect(pipeline.layout(unwired(), CONTEXT_DIAGRAM).tunnels).toEqual([]);
  });
});
