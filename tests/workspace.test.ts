import { describe, expect, it } from 'vitest';
import { arrowMenu, diagramMenu, functionMenu, menuFor, parentArrowMenu, type MenuAction, type MenuEntry } from '../src/app/editor/contextMenu';
import { addFunctionStep, decomposeStep, deleteSelectionCommand, renameFunctionCommand, STARTING_BOXES } from '../src/app/editor/functionActions';
import { definitionOf, filterGlossary, glossaryCounts, glossaryRows } from '../src/app/editor/glossaryView';
import { ancestors, branchOf, expandableIds, treeMove, treeRows } from '../src/app/editor/treeView';
import { createWorkspaceState, workspaceReducer, type WorkspaceAction, type WorkspaceState } from '../src/app/editor/workspaceState';
import { addArrow, addFunction, arrowsOn, CONTEXT_DIAGRAM, createModel, defineTerm, functionsOn, inheritedBoundary, renameArrow, type Command, type Model } from '../src/domain';

/** A0 with one arrow per side, decomposed into A1..A3; A2 is decomposed again. Only "Water" is wired on A0's diagram. */
function sample(): Model {
  const external = (id: string, label: string, role: 'input' | 'control' | 'mechanism'): Command =>
    addArrow({ id, diagramId: CONTEXT_DIAGRAM, label, sources: [{ kind: 'boundary', link: { kind: 'external', role } }], targets: [{ kind: 'function', functionId: 'root', role }] });
  return [
    external('water', 'Water', 'input'),
    external('recipe', 'Recipe', 'control'),
    external('cook', 'Cook', 'mechanism'),
    addArrow({ id: 'tea', diagramId: CONTEXT_DIAGRAM, label: 'Tea', sources: [{ kind: 'function', functionId: 'root' }], targets: [{ kind: 'boundary', link: { kind: 'external' } }] }),
    addFunction({ parentId: 'root', label: 'Boil Water', id: 'boil' }),
    addFunction({ parentId: 'root', label: 'Steep Leaves', id: 'steep' }),
    addFunction({ parentId: 'root', label: 'Pour Tea', id: 'pour' }),
    addFunction({ parentId: 'steep', label: 'Add Leaves', id: 'leaves' }),
    addFunction({ parentId: 'steep', label: 'Wait', id: 'wait' }),
    addArrow({ id: 'water-in', diagramId: 'root', label: 'Water', sources: [{ kind: 'boundary', link: { kind: 'inherited', parentArrowId: 'water' } }], targets: [{ kind: 'function', functionId: 'boil', role: 'input' }] }),
    addArrow({ id: 'hot', diagramId: 'root', label: 'Hot water', sources: [{ kind: 'function', functionId: 'boil' }], targets: [{ kind: 'function', functionId: 'steep', role: 'input' }] }),
  ].reduce((model, command) => command.apply(model), createModel({ rootId: 'root', rootLabel: 'Make Tea' }));
}

const reduce = (state: WorkspaceState, ...actions: WorkspaceAction[]): WorkspaceState => actions.reduce(workspaceReducer, state);
const labels = (entries: readonly MenuEntry[]): string[] => entries.map((e) => (e.kind === 'separator' ? '-' : e.kind === 'heading' ? `[${e.label}]` : e.label));
const entry = (entries: readonly MenuEntry[], label: string): Extract<MenuEntry, { kind: 'item' }> => {
  const found = entries.find((e) => e.kind === 'item' && e.label === label);
  if (found?.kind !== 'item') throw new Error(`No menu item "${label}"`);
  return found;
};
/** Carries out a menu action the way the screen does, as far as the model goes. */
const apply = (model: Model, action: MenuAction): Model => (action.type === 'run' ? action.command.apply(model) : model);

describe('function tree rows', () => {
  it('shows the context diagram, then only functions whose ancestors are expanded', () => {
    const model = sample();
    expect(treeRows(model, new Set()).map((r) => r.number)).toEqual(['A-0', 'A0']);
    expect(treeRows(model, new Set(['root'])).map((r) => [r.number, r.depth, r.decomposed, r.expanded])).toEqual([
      ['A-0', 0, false, false],
      ['A0', 0, true, true],
      ['A1', 1, false, false],
      ['A2', 1, true, false],
      ['A3', 1, false, false],
    ]);
    // A branch that is expanded under a collapsed one stays hidden.
    expect(treeRows(model, new Set(['steep'])).map((r) => r.number)).toEqual(['A-0', 'A0']);
    expect(treeRows(model, new Set(['root', 'steep'])).map((r) => r.number)).toEqual(['A-0', 'A0', 'A1', 'A2', 'A21', 'A22', 'A3']);
  });

  it('knows which branches a diagram needs open', () => {
    const model = sample();
    expect(expandableIds(model)).toEqual(['root', 'steep']);
    expect(ancestors(model, 'wait')).toEqual(['root', 'steep']);
    expect(branchOf(model, 'steep')).toEqual(['root', 'steep']);
    expect(branchOf(model, CONTEXT_DIAGRAM)).toEqual([]);
    expect(branchOf(model, 'gone')).toEqual([]);
  });

  it('moves with the arrow keys the way a tree does', () => {
    const model = sample();
    const rows = treeRows(model, new Set(['root']));
    expect(treeMove(model, rows, 'root', 'ArrowDown')).toEqual({ kind: 'focus', id: 'boil' });
    expect(treeMove(model, rows, 'root', 'ArrowUp')).toEqual({ kind: 'focus', id: CONTEXT_DIAGRAM });
    expect(treeMove(model, rows, CONTEXT_DIAGRAM, 'ArrowUp')).toBeUndefined();
    expect(treeMove(model, rows, 'boil', 'End')).toEqual({ kind: 'focus', id: 'pour' });
    // Right opens a closed branch, then steps into it; left closes it, then steps out.
    expect(treeMove(model, rows, 'steep', 'ArrowRight')).toEqual({ kind: 'expand', id: 'steep' });
    expect(treeMove(model, rows, 'root', 'ArrowRight')).toEqual({ kind: 'focus', id: 'boil' });
    expect(treeMove(model, rows, 'root', 'ArrowLeft')).toEqual({ kind: 'collapse', id: 'root' });
    expect(treeMove(model, rows, 'pour', 'ArrowLeft')).toEqual({ kind: 'focus', id: 'root' });
    expect(treeMove(model, rows, 'boil', 'ArrowRight')).toBeUndefined();
    expect(treeMove(model, rows, 'boil', 'x')).toBeUndefined();
  });
});

describe('workspace state', () => {
  it('toggles panels and branches independently', () => {
    let state = createWorkspaceState(['root']);
    state = reduce(state, { type: 'toggle-panel', panel: 'violations' }, { type: 'toggle-panel', panel: 'tree' }, { type: 'toggle-branch', id: 'steep' }, { type: 'toggle-branch', id: 'root' });
    expect([state.violationsOpen, state.treeOpen, state.editorOpen]).toEqual([true, false, true]);
    expect([...state.expanded]).toEqual(['steep']);
  });

  it('reveals branches without closing any, and keeps the same value when nothing changes', () => {
    const state = createWorkspaceState(['root']);
    expect(reduce(state, { type: 'reveal', ids: ['root'] })).toBe(state);
    expect([...reduce(state, { type: 'reveal', ids: ['root', 'steep'] }).expanded]).toEqual(['root', 'steep']);
    expect([...reduce(state, { type: 'expand-only', ids: [] }).expanded]).toEqual([]);
  });

  it('a focus request brings the editor panel and the diagram back into view until it is met', () => {
    let state = reduce(createWorkspaceState(), { type: 'toggle-panel', panel: 'editor' }, { type: 'show', view: 'glossary', glossaryFilter: 'undefined' });
    expect([state.view, state.glossaryFilter, state.editorOpen]).toEqual(['glossary', 'undefined', false]);
    state = reduce(state, { type: 'focus', field: 'control' });
    expect([state.view, state.editorOpen, state.focus]).toEqual(['diagram', true, 'control']);
    state = reduce(state, { type: 'focused' });
    expect(state.focus).toBeUndefined();
    expect(reduce(state, { type: 'focused' })).toBe(state);
    expect(reduce(state, { type: 'fit' }).fitRequests).toBe(1);
  });
});

describe('function actions', () => {
  it('adds a box to the open diagram, and to A0 from the context diagram', () => {
    const model = sample();
    const onChild = addFunctionStep(model, 'steep');
    expect(functionsOn(onChild.command.apply(model), 'steep')).toHaveLength(3);
    expect(onChild.then.open).toBe('steep');
    const onContext = addFunctionStep(model, CONTEXT_DIAGRAM);
    expect(onContext.then.open).toBe('root');
    expect(functionsOn(onContext.command.apply(model), 'root')).toHaveLength(4);
  });

  it('decomposes a leaf into placeholder boxes and opens the new diagram', () => {
    const model = sample();
    expect(decomposeStep(model, 'steep')).toBeUndefined();
    const step = decomposeStep(model, 'boil')!;
    expect(functionsOn(step.command.apply(model), 'boil')).toHaveLength(STARTING_BOXES);
    expect(step.then).toMatchObject({ open: 'boil', select: { kind: 'function' } });
  });

  it('renaming the root renames a model that still carries its name', () => {
    const model = sample();
    expect(renameFunctionCommand(model, 'root', 'Brew Tea').apply(model).info.name).toBe('Brew Tea');
    expect(renameFunctionCommand(model, 'boil', 'Heat Water').apply(model).info.name).toBe('Make Tea');
  });

  it('deletes the selected function or arrow, but not the root or a parent arrow', () => {
    const model = sample();
    expect(deleteSelectionCommand(model, { kind: 'none' })).toBeUndefined();
    expect(deleteSelectionCommand(model, { kind: 'function', id: 'root' })).toBeUndefined();
    expect(deleteSelectionCommand(model, { kind: 'parent-arrow', id: 'tea' })).toBeUndefined();
    expect(deleteSelectionCommand(model, { kind: 'function', id: 'pour' })!.apply(model).functions.pour).toBeUndefined();
    expect(arrowsOn(deleteSelectionCommand(model, { kind: 'arrow', id: 'hot' })!.apply(model), 'root').map((a) => a.id)).toEqual(['water-in']);
  });
});

describe('glossary view', () => {
  it('lists terms alphabetically with every function and arrow they name', () => {
    const rows = glossaryRows(sample());
    expect(rows.map((r) => r.term)).toEqual(['Add Leaves', 'Boil Water', 'Cook', 'Hot water', 'Make Tea', 'Pour Tea', 'Recipe', 'Steep Leaves', 'Tea', 'Wait', 'Water']);
    // One name on two diagrams is one term with two uses.
    expect(rows.find((r) => r.term === 'Water')!.uses).toEqual([
      { kind: 'arrow', id: 'water', diagramId: CONTEXT_DIAGRAM, node: 'A-0' },
      { kind: 'arrow', id: 'water-in', diagramId: 'root', node: 'A0' },
    ]);
    expect(rows.find((r) => r.term === 'Wait')!.uses).toEqual([{ kind: 'function', id: 'wait', diagramId: 'steep', node: 'A22' }]);
  });

  it('tells defined, undefined and unused terms apart and counts them', () => {
    let model = defineTerm({ term: 'Hot water', definition: 'Water at a rolling boil' }).apply(sample());
    model = renameArrow({ id: 'hot', label: 'Boiled water' }).apply(model);
    model = defineTerm({ term: 'Tea', definition: 'The finished drink' }).apply(model);
    const rows = glossaryRows(model);
    expect(rows.find((r) => r.term === 'Hot water')).toMatchObject({ status: 'unused', uses: [] });
    expect(rows.find((r) => r.term === 'Tea')!.status).toBe('defined');
    expect(glossaryCounts(rows)).toEqual({ used: 11, defined: 1, undefined: 10, unused: 1 });
    expect(definitionOf(model, 'Tea')).toBe('The finished drink');
    expect(definitionOf(model, 'Nothing')).toBe('');
  });

  it('filters by status and searches terms and definitions without regard to case', () => {
    const model = defineTerm({ term: 'Tea', definition: 'The finished DRINK' }).apply(sample());
    const rows = glossaryRows(model);
    expect(filterGlossary(rows, 'all', '')).toHaveLength(11);
    expect(filterGlossary(rows, 'undefined', '')).toHaveLength(10);
    expect(filterGlossary(rows, 'unused', '')).toEqual([]);
    expect(filterGlossary(rows, 'all', ' water ').map((r) => r.term)).toEqual(['Boil Water', 'Hot water', 'Water']);
    expect(filterGlossary(rows, 'all', 'drink').map((r) => r.term)).toEqual(['Tea']);
    expect(filterGlossary(rows, 'undefined', 'drink')).toEqual([]);
  });
});

describe('right-click menus', () => {
  it('offers a leaf function decompose, a decomposed one its diagram, and reordering where there is room', () => {
    const model = sample();
    expect(labels(functionMenu(model, 'boil'))).toEqual([
      'Decompose', 'Rename', 'Define in glossary', '-', '[Add arrow]', 'Input…', 'Control…', 'Output…', 'Mechanism…', '-', 'Move earlier', 'Move later', '-', 'Delete',
    ]);
    expect(entry(functionMenu(model, 'boil'), 'Move earlier').disabled).toBe(true);
    expect(entry(functionMenu(model, 'boil'), 'Move later').disabled).toBe(false);
    expect(entry(functionMenu(model, 'pour'), 'Move later').disabled).toBe(true);
    expect(entry(functionMenu(model, 'steep'), 'Open diagram').action).toEqual({ type: 'open', diagramId: 'steep' });
    const moved = apply(model, entry(functionMenu(model, 'boil'), 'Move later').action);
    expect(functionsOn(moved, 'root').map((f) => f.id)).toEqual(['steep', 'boil', 'pour']);
  });

  it('never offers to delete or reorder the root function', () => {
    const menu = functionMenu(sample(), 'root');
    expect(['Delete', 'Move earlier', 'Move later'].map((l) => entry(menu, l).disabled)).toEqual([true, true, true]);
  });

  it('sends rename and add-arrow to the right field of the editor panel', () => {
    const menu = functionMenu(sample(), 'wait');
    const selection = { kind: 'function', id: 'wait' };
    expect(entry(menu, 'Rename').action).toEqual({ type: 'edit', diagramId: 'steep', selection, field: 'label' });
    expect(entry(menu, 'Control…').action).toEqual({ type: 'edit', diagramId: 'steep', selection, field: 'control' });
  });

  it('lets an arrow be renamed, reordered and deleted', () => {
    const model = sample();
    const menu = arrowMenu(model, 'hot');
    expect(labels(menu)).toEqual(['Rename', 'Define in glossary', '-', 'Move earlier', 'Move later', '-', 'Delete']);
    expect([entry(menu, 'Move earlier').disabled, entry(menu, 'Move later').disabled]).toEqual([false, true]);
    expect(arrowsOn(apply(model, entry(menu, 'Delete').action), 'root').map((a) => a.id)).toEqual(['water-in']);
  });

  it('connects an unconnected parent arrow to any function on the diagram', () => {
    const model = sample();
    const menu = parentArrowMenu(model, 'root', 'recipe');
    expect(labels(menu)).toEqual(['[Connect C1 to]', 'A1 Boil Water', 'A2 Steep Leaves', 'A3 Pour Tea', '-', 'Show on the parent diagram']);
    const connected = apply(model, entry(menu, 'A2 Steep Leaves').action);
    expect(inheritedBoundary(connected, 'root').find((p) => p.parentArrowId === 'recipe')!.state).toBe('connected');
    // Once connected there is nothing left to connect, only the way back up.
    expect(labels(parentArrowMenu(connected, 'root', 'recipe'))).toEqual(['Show on the parent diagram']);
    expect(entry(menu, 'Show on the parent diagram').action).toEqual({ type: 'open', diagramId: CONTEXT_DIAGRAM, select: { kind: 'arrow', id: 'recipe' } });
    expect(parentArrowMenu(model, 'root', 'nope')).toEqual([]);
  });

  it('offers diagram-wide actions on empty space, with the way up on a child diagram', () => {
    const model = sample();
    expect(labels(diagramMenu(model, CONTEXT_DIAGRAM))).toEqual(['Add function', '-', 'Fit to window', '-', 'Export this diagram as SVG']);
    expect(labels(diagramMenu(model, 'steep'))).toEqual(['Add function', '-', 'Fit to window', 'Go up to A0', '-', 'Export this diagram as SVG']);
    expect(entry(diagramMenu(model, 'steep'), 'Go up to A0').action).toEqual({ type: 'open', diagramId: 'root', select: { kind: 'function', id: 'steep' } });
  });

  it('picks the menu by what was clicked', () => {
    const model = sample();
    expect(labels(menuFor(model, 'root', { kind: 'function', id: 'boil' }))[0]).toBe('Decompose');
    expect(labels(menuFor(model, 'root', { kind: 'arrow', id: 'hot' }))[0]).toBe('Rename');
    expect(labels(menuFor(model, 'root', { kind: 'parent-arrow', id: 'tea' }))[0]).toBe('[Connect O1 to]');
    expect(labels(menuFor(model, 'root', { kind: 'none' }))[0]).toBe('Add function');
  });
});
