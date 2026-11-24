import { describe, expect, it } from 'vitest';
import { choiceAt, connectParentArrow, detachArrow, entryRoleOf, otherEndChoices, planArrowEntry, sourceChoices, targetChoices, targetPlaces, type EntryPlan } from '../src/app/editor/arrowEntry';
import { canRedoEdit, canUndoEdit, createEditorState, currentModel, editorReducer, hasUnsavedChanges, type EditorAction, type EditorState } from '../src/app/editor/editorState';
import { addArrow, addFunction, arrowsOn, batch, CONTEXT_DIAGRAM, createModel, deleteFunction, getArrow, inheritedBoundary, renameFunction, type Command, type Model } from '../src/domain';

/** A0 with one arrow per side, decomposed into A1..A3, nothing wired on the child diagram. */
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
  ].reduce((model, command) => command.apply(model), createModel({ rootId: 'root', rootLabel: 'Make Tea' }));
}

function reduce(state: EditorState, ...actions: EditorAction[]): EditorState {
  return actions.reduce(editorReducer, state);
}

function apply(model: Model, plan: EntryPlan): Model {
  if (plan.kind === 'invalid') throw new Error(plan.reason);
  return plan.command.apply(model);
}

describe('editor state', () => {
  it('runs commands with undo and redo, and tracks unsaved changes', () => {
    let state = createEditorState(sample());
    expect(hasUnsavedChanges(state)).toBe(false);
    state = reduce(state, { type: 'run', command: renameFunction({ id: 'boil', label: 'Heat Water' }) });
    expect(currentModel(state).functions.boil!.label).toBe('Heat Water');
    expect([canUndoEdit(state), canRedoEdit(state), hasUnsavedChanges(state)]).toEqual([true, false, true]);
    state = reduce(state, { type: 'saved' });
    expect(hasUnsavedChanges(state)).toBe(false);
    state = reduce(state, { type: 'undo' });
    expect(currentModel(state).functions.boil!.label).toBe('Boil Water');
    expect(canRedoEdit(state)).toBe(true);
    state = reduce(state, { type: 'redo' });
    expect(currentModel(state).functions.boil!.label).toBe('Heat Water');
  });

  it('keeps the model and reports why when a command is invalid', () => {
    const state = createEditorState(sample());
    const next = reduce(state, { type: 'run', command: deleteFunction({ id: 'root' }) });
    expect(currentModel(next)).toBe(currentModel(state));
    expect(next.message).toBe('The root function cannot be deleted');
    expect(reduce(next, { type: 'dismiss' }).message).toBeUndefined();
  });

  it('opens only diagrams that exist and clears the selection on the way', () => {
    let state = reduce(createEditorState(sample()), { type: 'select', selection: { kind: 'function', id: 'root' } });
    state = reduce(state, { type: 'open', diagramId: 'root' });
    expect([state.diagramId, state.selection.kind]).toEqual(['root', 'none']);
    expect(reduce(state, { type: 'open', diagramId: 'boil' }).diagramId).toBe('root');
  });

  it('falls back to the nearest diagram above when the open one disappears', () => {
    const decompose = batch('Decompose', [addFunction({ parentId: 'steep', id: 's1', label: 'Add Leaves' }), addFunction({ parentId: 'steep', id: 's2', label: 'Wait' })]);
    let state = reduce(createEditorState(sample()), { type: 'run', command: decompose, open: 'steep', select: { kind: 'function', id: 's1' } });
    expect(state.diagramId).toBe('steep');
    state = reduce(state, { type: 'undo' });
    expect(state.diagramId).toBe('root');
    expect(state.selection).toEqual({ kind: 'none' });
    state = reduce(state, { type: 'redo' }, { type: 'open', diagramId: 'steep' }, { type: 'run', command: deleteFunction({ id: 'steep' }) });
    expect(state.diagramId).toBe('root');
  });

  it('a batch undoes as one step and applies nothing when a part fails', () => {
    const model = sample();
    const failing = batch('Bad', [renameFunction({ id: 'boil', label: 'X' }), deleteFunction({ id: 'root' })]);
    const state = reduce(createEditorState(model), { type: 'run', command: failing });
    expect(currentModel(state)).toBe(model);
  });
});

describe('arrow entry', () => {
  it('on the context diagram the only boundary is outside the model', () => {
    expect(sourceChoices(sample(), CONTEXT_DIAGRAM, 'input').map((c) => c.text)).toEqual(['A0 Make Tea', 'Outside the model']);
    expect(otherEndChoices(sample(), 'root', 'control').map((c) => c.key)).toEqual(['external']);
  });

  it('on a child diagram offers unconnected parent arrows of that role first, then functions, splits and tunnels', () => {
    const choices = otherEndChoices(sample(), 'boil', 'input');
    expect(choices.map((c) => c.text)).toEqual(['I1 Water', 'A2 Steep Leaves', 'A3 Pour Tea', 'Part of I1 Water', 'Tunneled (not on the parent)']);
    expect(choices[0]!.defaultLabel).toBe('Water');
    expect(otherEndChoices(sample(), 'boil', 'output').map((c) => c.text)).toEqual([
      'O1 Tea',
      'A2 Steep Leaves, as input',
      'A2 Steep Leaves, as control',
      'A2 Steep Leaves, as mechanism',
      'A3 Pour Tea, as input',
      'A3 Pour Tea, as control',
      'A3 Pour Tea, as mechanism',
      'Part of O1 Tea',
      'Tunneled (not on the parent)',
    ]);
  });

  it('groups targets by place, so "to where" and "as what" are separate questions', () => {
    const model = sample();
    const places = targetPlaces(model, otherEndChoices(model, 'boil', 'output'));
    expect(places.map((p) => [p.text, p.group, p.choices.length])).toEqual([
      ['O1 Tea', 'Boundary', 1],
      ['A2 Steep Leaves', 'Functions', 3],
      ['A3 Pour Tea', 'Functions', 3],
      ['Part of O1 Tea', 'Boundary', 1],
      ['Tunneled (not on the parent)', 'Boundary', 1],
    ]);
    expect(places[1]!.choices.map(entryRoleOf)).toEqual(['input', 'control', 'mechanism']);
    expect(entryRoleOf(places[0]!.choices[0]!)).toBeUndefined();
    // Only the roles still open at a function are offered there.
    const open = targetPlaces(model, targetChoices(model, 'root').filter((c) => c.key !== 'function:steep:input'));
    expect(open.find((p) => p.key === 'function:steep')!.choices.map(entryRoleOf)).toEqual(['control', 'mechanism']);
    // Sources have no role, so each is a place of its own.
    expect(targetPlaces(model, sourceChoices(model, 'root', 'input')).every((p) => p.choices.length === 1)).toBe(true);
  });

  it('keeps the role when only the place changes, where the new place offers it', () => {
    const model = sample();
    const [, steep, pour, , tunneled] = targetPlaces(model, otherEndChoices(model, 'boil', 'output'));
    const asControl = steep!.choices[1]!;
    expect(choiceAt(pour!, asControl).key).toBe('function:pour:control');
    expect(choiceAt(pour!, undefined).key).toBe('function:pour:input');
    expect(choiceAt(tunneled!, asControl).key).toBe('tunneled');
    expect(choiceAt({ ...pour!, choices: [pour!.choices[0]!] }, asControl).key).toBe('function:pour:input');
  });

  it('a blank label on a parent arrow takes the parent label and connects it', () => {
    const model = sample();
    const other = otherEndChoices(model, 'boil', 'input')[0];
    const next = apply(model, planArrowEntry(model, { functionId: 'boil', role: 'input', label: '', other }));
    expect(arrowsOn(next, 'root').map((a) => a.label)).toEqual(['Water']);
    expect(inheritedBoundary(next, 'root').find((b) => b.code === 'I1')!.state).toBe('connected');
    // Once carried in whole, the parent arrow is no longer offered.
    expect(targetChoices(next, 'root').some((c) => c.key.includes('water'))).toBe(false);
    expect(sourceChoices(next, 'root', 'input').map((c) => c.group)).toEqual(['Functions', 'Functions', 'Functions', 'Boundary']);
  });

  it('a new label makes a new arrow between the function and the other end', () => {
    const model = sample();
    const toSteep = otherEndChoices(model, 'boil', 'output').find((c) => c.key === 'function:steep:input');
    const plan = planArrowEntry(model, { functionId: 'boil', role: 'output', label: ' Hot water ', other: toSteep });
    expect(plan.kind).toBe('new');
    const arrow = arrowsOn(apply(model, plan), 'root')[0]!;
    expect(arrow).toMatchObject({ label: 'Hot water', sources: [{ kind: 'function', functionId: 'boil' }], targets: [{ kind: 'function', functionId: 'steep', role: 'input' }] });
  });

  it('typing the label of an existing arrow branches or joins it instead of duplicating it', () => {
    let model = sample();
    model = apply(model, planArrowEntry(model, { functionId: 'boil', role: 'mechanism', label: '', other: otherEndChoices(model, 'boil', 'mechanism')[0] }));
    const cook = arrowsOn(model, 'root')[0]!;

    const branch = planArrowEntry(model, { functionId: 'steep', role: 'mechanism', label: 'cook', other: undefined });
    expect(branch).toMatchObject({ kind: 'branch', description: 'Branches the existing arrow "Cook" to this function' });
    model = apply(model, branch);
    expect(getArrow(model, cook.id).targets).toHaveLength(2);
    expect(arrowsOn(model, 'root')).toHaveLength(1);
    expect(planArrowEntry(model, { functionId: 'steep', role: 'mechanism', label: 'Cook', other: undefined })).toMatchObject({ kind: 'invalid' });

    model = apply(model, planArrowEntry(model, { functionId: 'boil', role: 'output', label: 'Steam', other: otherEndChoices(model, 'boil', 'output').find((c) => c.key === 'tunneled') }));
    const join = planArrowEntry(model, { functionId: 'steep', role: 'output', label: 'Steam', other: undefined });
    expect(join.kind).toBe('join');
    model = apply(model, join);
    const further = planArrowEntry(model, { functionId: 'steep', role: 'output', label: 'Steam', other: otherEndChoices(model, 'steep', 'output').find((c) => c.key === 'function:pour:control') });
    expect(further.kind).toBe('branch');
    const steam = arrowsOn(apply(model, further), 'root').find((a) => a.label === 'Steam')!;
    expect([steam.sources.length, steam.targets.length]).toEqual([2, 2]);
  });

  it('needs a label and, for a new arrow, an other end', () => {
    const model = sample();
    expect(planArrowEntry(model, { functionId: 'boil', role: 'control', label: '  ', other: otherEndChoices(model, 'boil', 'control').find((c) => c.key === 'tunneled') })).toEqual({ kind: 'invalid', reason: 'Type a label' });
    expect(planArrowEntry(model, { functionId: 'boil', role: 'control', label: 'Rule', other: undefined })).toEqual({ kind: 'invalid', reason: 'Choose where the arrow comes from' });
  });

  it('connects a parent arrow to a function in one step, once', () => {
    let model = sample();
    model = apply(model, connectParentArrow(model, 'root', 'tea', 'pour'));
    expect(arrowsOn(model, 'root')[0]).toMatchObject({ label: 'Tea', sources: [{ kind: 'function', functionId: 'pour' }], targets: [{ kind: 'boundary', link: { kind: 'inherited', parentArrowId: 'tea' } }] });
    expect(connectParentArrow(model, 'root', 'tea', 'boil').kind).toBe('invalid');
    expect(connectParentArrow(model, 'root', 'nope', 'boil').kind).toBe('invalid');
  });

  it('detaching the last end of an arrow deletes it, otherwise the arrow keeps its other ends', () => {
    let model = sample();
    model = apply(model, connectParentArrow(model, 'root', 'cook', 'boil'));
    model = apply(model, planArrowEntry(model, { functionId: 'steep', role: 'mechanism', label: 'Cook', other: undefined }));
    const cook = arrowsOn(model, 'root')[0]!;
    model = detachArrow(cook, 'boil', 'mechanism').apply(model);
    expect(getArrow(model, cook.id).targets).toEqual([{ kind: 'function', functionId: 'steep', role: 'mechanism' }]);
    model = detachArrow(getArrow(model, cook.id), 'steep', 'mechanism').apply(model);
    expect(arrowsOn(model, 'root')).toEqual([]);
  });
});
