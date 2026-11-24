import { describe, expect, it } from 'vitest';
import {
  addArrow,
  addArrowTarget,
  addFunction,
  arrowsAt,
  arrowsOn,
  boundaryCode,
  canRedo,
  canUndo,
  CONTEXT_DIAGRAM,
  createHistory,
  createModel,
  defineTerm,
  deleteArrow,
  deleteFunction,
  diagramIds,
  DomainError,
  execute,
  getArrow,
  glossaryTerms,
  inheritedBoundary,
  integrityProblems,
  moveArrow,
  moveFunction,
  nodeNumber,
  redo,
  removeArrowTarget,
  renameFunction,
  undo,
  type Command,
  type Model,
} from '../src/domain';

function run(model: Model, ...commands: Command[]): Model {
  return commands.reduce((m, c) => c.apply(m), model);
}

/** A0 with one input and one output, decomposed into A1..A3. */
function sample(): Model {
  return run(
    createModel({ rootId: 'root', rootLabel: 'Make Tea' }),
    addArrow({ id: 'water', diagramId: CONTEXT_DIAGRAM, label: 'Water', sources: [{ kind: 'boundary', link: { kind: 'external', role: 'input' } }], targets: [{ kind: 'function', functionId: 'root', role: 'input' }] }),
    addArrow({ id: 'recipe', diagramId: CONTEXT_DIAGRAM, label: 'Recipe', sources: [{ kind: 'boundary', link: { kind: 'external', role: 'control' } }], targets: [{ kind: 'function', functionId: 'root', role: 'control' }] }),
    addArrow({ id: 'tea', diagramId: CONTEXT_DIAGRAM, label: 'Tea', sources: [{ kind: 'function', functionId: 'root' }], targets: [{ kind: 'boundary', link: { kind: 'external' } }] }),
    addFunction({ parentId: 'root', label: 'Boil Water', id: 'boil' }),
    addFunction({ parentId: 'root', label: 'Steep Leaves', id: 'steep' }),
    addFunction({ parentId: 'root', label: 'Pour Tea', id: 'pour' }),
  );
}

describe('function commands', () => {
  it('number functions by tree position and renumber on reorder', () => {
    const model = sample();
    expect(['boil', 'steep', 'pour'].map((id) => nodeNumber(model, id))).toEqual(['A1', 'A2', 'A3']);
    const moved = moveFunction({ id: 'pour', toIndex: 0 }).apply(model);
    expect(['boil', 'steep', 'pour'].map((id) => nodeNumber(moved, id))).toEqual(['A2', 'A3', 'A1']);
    const deeper = addFunction({ parentId: 'steep', label: 'Add Leaves', id: 'leaves' }).apply(model);
    expect(nodeNumber(deeper, 'leaves')).toBe('A21');
    expect(diagramIds(deeper)).toEqual([CONTEXT_DIAGRAM, 'root', 'steep']);
  });

  it('never mutate the model they are applied to', () => {
    const model = sample();
    const before = JSON.stringify(model);
    renameFunction({ id: 'boil', label: 'Heat Water' }).apply(model);
    deleteFunction({ id: 'steep' }).apply(model);
    expect(JSON.stringify(model)).toBe(before);
  });

  it('refuse to delete the root or to reuse an id', () => {
    expect(() => deleteFunction({ id: 'root' }).apply(sample())).toThrow(DomainError);
    expect(() => addFunction({ parentId: 'root', label: 'Again', id: 'boil' }).apply(sample())).toThrow(DomainError);
  });
});

describe('boundary inheritance', () => {
  const inherit = addArrow({
    id: 'water-in',
    diagramId: 'root',
    label: 'Water',
    sources: [{ kind: 'boundary', link: { kind: 'inherited', parentArrowId: 'water' } }],
    targets: [{ kind: 'function', functionId: 'boil', role: 'input' }],
  });

  it('shows every parent arrow on the child boundary, unconnected until linked', () => {
    const model = sample();
    expect(inheritedBoundary(model, 'root').map((b) => `${b.code} ${b.label} ${b.state}`)).toEqual([
      'I1 Water unconnected',
      'C1 Recipe unconnected',
      'O1 Tea unconnected',
    ]);
    const linked = inherit.apply(model);
    expect(inheritedBoundary(linked, 'root')[0]).toMatchObject({ state: 'connected', childArrowIds: ['water-in'] });
    expect(boundaryCode(linked, getArrow(linked, 'water-in'), 'source')).toBe('I1');
  });

  it('derives ICOM codes from arrow order, so reordering changes them', () => {
    const model = run(
      sample(),
      addArrow({ id: 'leaves', diagramId: CONTEXT_DIAGRAM, label: 'Leaves', sources: [{ kind: 'boundary', link: { kind: 'external', role: 'input' } }], targets: [{ kind: 'function', functionId: 'root', role: 'input' }] }),
    );
    expect(inheritedBoundary(model, 'root').filter((b) => b.role === 'input').map((b) => b.label)).toEqual(['Water', 'Leaves']);
    const reordered = moveArrow({ id: 'leaves', toIndex: 0 }).apply(model);
    expect(inheritedBoundary(reordered, 'root').filter((b) => b.role === 'input').map((b) => `${b.code} ${b.label}`)).toEqual(['I1 Leaves', 'I2 Water']);
  });

  it('records a split as named sub-arrows of one parent arrow', () => {
    const split = (id: string, label: string, to: string): Command =>
      addArrow({ id, diagramId: 'root', label, sources: [{ kind: 'boundary', link: { kind: 'split', parentArrowId: 'recipe' } }], targets: [{ kind: 'function', functionId: to, role: 'control' }] });
    const model = run(sample(), split('r1', 'Boiling time', 'boil'), split('r2', 'Steeping time', 'steep'));
    expect(inheritedBoundary(model, 'root')[1]).toMatchObject({ code: 'C1', state: 'split', childArrowIds: ['r1', 'r2'] });
    expect(boundaryCode(model, getArrow(model, 'r2'), 'source')).toBe('C1');
  });

  it('rejects boundary ends that nothing explains', () => {
    const model = sample();
    const bad = (link: object): Command =>
      addArrow({ diagramId: 'root', label: 'X', sources: [{ kind: 'boundary', link } as never], targets: [{ kind: 'function', functionId: 'boil', role: 'input' }] });
    expect(() => bad({ kind: 'external', role: 'input' }).apply(model)).toThrow(/only the context diagram/);
    expect(() => bad({ kind: 'inherited', parentArrowId: 'missing' }).apply(model)).toThrow(/does not exist/);
    expect(() => bad({ kind: 'inherited', parentArrowId: 'tea' }).apply(model)).toThrow(/does not touch/);
    expect(() => run(model, inherit, bad({ kind: 'inherited', parentArrowId: 'water' }))).toThrow(/inherited more than once/);
    expect(() => bad({ kind: 'tunneled', role: 'input' }).apply(model)).not.toThrow();
  });

  it('rejects arrows that leave their diagram or lack an end', () => {
    const model = sample();
    expect(() => addArrow({ diagramId: CONTEXT_DIAGRAM, label: 'X', sources: [{ kind: 'function', functionId: 'boil' }], targets: [{ kind: 'boundary', link: { kind: 'external' } }] }).apply(model)).toThrow(/not on the arrow's diagram/);
    expect(() => addArrow({ diagramId: 'root', label: 'X', sources: [{ kind: 'function', functionId: 'boil' }], targets: [] }).apply(model)).toThrow(/no target/);
    expect(() => addArrow({ diagramId: 'boil', label: 'X', sources: [{ kind: 'function', functionId: 'boil' }], targets: [{ kind: 'function', functionId: 'steep', role: 'input' }] }).apply(model)).toThrow(/diagram "boil" does not exist/);
  });
});

describe('side order', () => {
  const fn = (functionId: string, role: 'input' | 'control' | 'mechanism') => ({ kind: 'function' as const, functionId, role });
  const from = (functionId: string) => ({ kind: 'function' as const, functionId });
  const inherited = (parentArrowId: string) => ({ kind: 'boundary' as const, link: { kind: 'inherited' as const, parentArrowId } });
  const on = (id: string, sources: Parameters<typeof addArrow>[0]['sources'], targets: Parameters<typeof addArrow>[0]['targets']): Command =>
    addArrow({ id, diagramId: 'root', label: id, sources, targets });
  // Added in an order that differs from the convention on every side.
  const model = run(
    sample(),
    on('redo', [from('pour')], [fn('steep', 'input'), fn('steep', 'control')]),
    on('water-in', [inherited('water')], [fn('steep', 'input')]),
    on('recipe-in', [inherited('recipe')], [fn('steep', 'control')]),
    on('hot', [from('boil')], [fn('steep', 'input'), fn('steep', 'control')]),
    on('back', [from('steep')], [fn('boil', 'input')]),
    on('near', [from('steep')], [fn('pour', 'input')]),
    on('out', [from('steep')], [{ kind: 'boundary', link: { kind: 'inherited', parentArrowId: 'tea' } }]),
  );
  const side = (role: 'input' | 'control' | 'output'): string[] => arrowsAt(model, 'steep', role).map((a) => a.id);

  it('puts inputs from earlier boxes first, then the boundary, then feedback', () => {
    expect(side('input')).toEqual(['hot', 'water-in', 'redo']);
    expect(side('control')).toEqual(['hot', 'recipe-in', 'redo']);
  });

  it('puts the output that reaches farthest first and feedback last', () => {
    expect(side('output')).toEqual(['out', 'near', 'back']);
  });

  it('gives a child diagram its ICOM codes in that same order', () => {
    const child = addFunction({ parentId: 'steep', label: 'Add Leaves', id: 'leaves' }).apply(model);
    expect(inheritedBoundary(child, 'steep').map((b) => `${b.code} ${b.label}`)).toEqual([
      'I1 hot', 'I2 water-in', 'I3 redo', 'C1 hot', 'C2 recipe-in', 'C3 redo', 'O1 out', 'O2 near', 'O3 back',
    ]);
  });
});

describe('branching and cascading deletes', () => {
  const base = (): Model =>
    run(
      sample(),
      addArrow({ id: 'hot', diagramId: 'root', label: 'Hot water', sources: [{ kind: 'function', functionId: 'boil' }], targets: [{ kind: 'function', functionId: 'steep', role: 'input' }] }),
      addArrowTarget({ id: 'hot', target: { kind: 'function', functionId: 'pour', role: 'control' } }),
      addFunction({ parentId: 'steep', label: 'Add Leaves', id: 'leaves' }),
      addArrow({ id: 'hot-in', diagramId: 'steep', label: 'Hot water', sources: [{ kind: 'boundary', link: { kind: 'inherited', parentArrowId: 'hot' } }], targets: [{ kind: 'function', functionId: 'leaves', role: 'input' }] }),
    );

  it('branch an arrow by adding a target', () => {
    expect(getArrow(base(), 'hot').targets).toHaveLength(2);
    expect(() => addArrowTarget({ id: 'hot', target: { kind: 'function', functionId: 'pour', role: 'control' } }).apply(base())).toThrow(/same function side twice/);
  });

  it('deleting a parent arrow removes the child arrows that carried it', () => {
    const model = deleteArrow({ id: 'hot' }).apply(base());
    expect(arrowsOn(model, 'steep')).toEqual([]);
    expect(integrityProblems(model)).toEqual([]);
  });

  it('removing the branch into a function removes its child boundary arrow', () => {
    const model = removeArrowTarget({ id: 'hot', index: 0 }).apply(base());
    expect(getArrow(model, 'hot').targets).toEqual([{ kind: 'function', functionId: 'pour', role: 'control' }]);
    expect(arrowsOn(model, 'steep')).toEqual([]);
  });

  it('deleting a function removes its decomposition and trims arrows that touched it', () => {
    const model = deleteFunction({ id: 'steep' }).apply(base());
    expect(Object.keys(model.functions).sort()).toEqual(['boil', 'pour', 'root']);
    expect(getArrow(model, 'hot').targets).toHaveLength(1);
    expect(model.arrows.some((a) => a.diagramId === 'steep')).toBe(false);
    const gone = deleteFunction({ id: 'boil' }).apply(model);
    expect(gone.arrows.map((a) => a.id)).toEqual(['water', 'recipe', 'tea']);
  });
});

describe('history', () => {
  it('undoes and redoes commands, and drops redo after a new edit', () => {
    let history = createHistory(sample());
    const original = history.present;
    history = execute(history, renameFunction({ id: 'boil', label: 'Heat Water' }));
    history = execute(history, renameFunction({ id: 'pour', label: 'Serve Tea' }));
    history = undo(history);
    expect(history.present.functions.pour!.label).toBe('Pour Tea');
    expect(history.present.functions.boil!.label).toBe('Heat Water');
    expect(canRedo(history)).toBe(true);
    history = redo(history);
    expect(history.present.functions.pour!.label).toBe('Serve Tea');
    history = undo(undo(history));
    expect(history.present).toBe(original);
    expect(canUndo(history)).toBe(false);
    history = execute(history, renameFunction({ id: 'boil', label: 'Warm Water' }));
    expect(canRedo(history)).toBe(false);
  });

  it('is left unchanged by a command that fails', () => {
    const history = createHistory(sample());
    expect(() => execute(history, deleteFunction({ id: 'root' }))).toThrow(DomainError);
    expect(history.past).toHaveLength(0);
  });
});

describe('glossary', () => {
  it('lists every label and keeps definitions whose term left the model', () => {
    const model = run(sample(), defineTerm({ term: 'Tea', definition: 'The finished drink.' }), defineTerm({ term: 'Kettle', definition: 'Old term.' }));
    const terms = glossaryTerms(model);
    expect(terms.find((t) => t.term === 'Tea')).toEqual({ term: 'Tea', definition: 'The finished drink.', used: true });
    expect(terms.find((t) => t.term === 'Boil Water')).toMatchObject({ definition: '', used: true });
    expect(terms.find((t) => t.term === 'Kettle')).toMatchObject({ used: false });
  });
});
