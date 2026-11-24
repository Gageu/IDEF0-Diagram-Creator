import { describe, expect, it } from 'vitest';
import { createPipeline, loadRouter } from '../src/app/composition';
import { addArrow, addFunction, CONTEXT_DIAGRAM, createModel, type Command, type Model } from '../src/domain';

const pipeline = createPipeline(await loadRouter());

/**
 * A model whose A0 diagram has `count` boxes in a chain, with a boundary
 * input and control, a mechanism shared by every box, a control that
 * branches to every other box, feedback from the last box to the first, and
 * a boundary output.
 */
function chain(count: number): Model {
  const ids = Array.from({ length: count }, (_, i) => `f${i + 1}`);
  const external = (id: string, role: 'input' | 'control' | 'mechanism'): Command =>
    addArrow({ id, diagramId: CONTEXT_DIAGRAM, label: `Outside ${role}`, sources: [{ kind: 'boundary', link: { kind: 'external', role } }], targets: [{ kind: 'function', functionId: 'root', role }] });
  const inherited = (parentArrowId: string) => ({ kind: 'boundary' as const, link: { kind: 'inherited' as const, parentArrowId } });
  const commands: Command[] = [
    external('in', 'input'),
    external('rule', 'control'),
    external('tool', 'mechanism'),
    addArrow({ id: 'out', diagramId: CONTEXT_DIAGRAM, label: 'Finished product', sources: [{ kind: 'function', functionId: 'root' }], targets: [{ kind: 'boundary', link: { kind: 'external' } }] }),
    ...ids.map((id, i) => addFunction({ parentId: 'root', id, label: `Perform Step ${i + 1}` })),
    addArrow({ id: 'in1', diagramId: 'root', label: 'Outside input', sources: [inherited('in')], targets: [{ kind: 'function', functionId: ids[0]!, role: 'input' }] }),
    addArrow({ id: 'rule1', diagramId: 'root', label: 'Outside control', sources: [inherited('rule')], targets: ids.filter((_, i) => i % 2 === 0).map((id) => ({ kind: 'function', functionId: id, role: 'control' as const })) }),
    addArrow({ id: 'tool1', diagramId: 'root', label: 'Outside mechanism', sources: [inherited('tool')], targets: ids.map((id) => ({ kind: 'function', functionId: id, role: 'mechanism' as const })) }),
    addArrow({ id: 'out1', diagramId: 'root', label: 'Finished product', sources: [{ kind: 'function', functionId: ids[count - 1]! }], targets: [inherited('out')] }),
    ...ids.slice(1).map((id, i) =>
      addArrow({ id: `step${i + 1}`, diagramId: 'root', label: `Result of step ${i + 1}`, sources: [{ kind: 'function', functionId: ids[i]! }], targets: [{ kind: 'function', functionId: id, role: 'input' }] }),
    ),
    ...(count > 1
      ? [addArrow({ id: 'redo', diagramId: 'root', label: 'Rework request', sources: [{ kind: 'function', functionId: ids[count - 1]! }], targets: [{ kind: 'function', functionId: ids[0]!, role: 'control' }] })]
      : []),
  ];
  return commands.reduce((model, command) => command.apply(model), createModel({ rootId: 'root', rootLabel: 'Make Product' }));
}

describe('diagrams of one to eight boxes', () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8])('draws %i boxes with no defects', (count) => {
    const geometry = pipeline.layout(chain(count), 'root');
    expect(geometry.boxes).toHaveLength(count);
    expect(geometry.defects).toEqual([]);
  });
});
