import { describe, expect, it } from 'vitest';
import { otherEndChoices, type EntryPlan } from '../src/app/editor/arrowEntry';
import { boxAt, dropParentArrow, droppedChoice, dropRole } from '../src/app/editor/connectDrag';
import { createWorkspaceState, workspaceReducer } from '../src/app/editor/workspaceState';
import { addArrow, addFunction, arrowsOn, CONTEXT_DIAGRAM, createModel, getArrow, inheritedBoundary, type Command, type Model } from '../src/domain';

/** A0 with one arrow per side and two inputs, decomposed into A1..A3. "Water" is carried in whole, "Leaves" is split. */
function sample(): Model {
  const external = (id: string, label: string, role: 'input' | 'control' | 'mechanism'): Command =>
    addArrow({ id, diagramId: CONTEXT_DIAGRAM, label, sources: [{ kind: 'boundary', link: { kind: 'external', role } }], targets: [{ kind: 'function', functionId: 'root', role }] });
  return [
    external('water', 'Water', 'input'),
    external('leaves', 'Leaves', 'input'),
    external('recipe', 'Recipe', 'control'),
    external('cook', 'Cook', 'mechanism'),
    addArrow({ id: 'tea', diagramId: CONTEXT_DIAGRAM, label: 'Tea', sources: [{ kind: 'function', functionId: 'root' }], targets: [{ kind: 'boundary', link: { kind: 'external' } }] }),
    addFunction({ parentId: 'root', label: 'Boil Water', id: 'boil' }),
    addFunction({ parentId: 'root', label: 'Steep Leaves', id: 'steep' }),
    addFunction({ parentId: 'root', label: 'Pour Tea', id: 'pour' }),
    addArrow({ id: 'water-in', diagramId: 'root', label: 'Water', sources: [{ kind: 'boundary', link: { kind: 'inherited', parentArrowId: 'water' } }], targets: [{ kind: 'function', functionId: 'boil', role: 'input' }] }),
    addArrow({ id: 'green', diagramId: 'root', label: 'Green leaves', sources: [{ kind: 'boundary', link: { kind: 'split', parentArrowId: 'leaves' } }], targets: [{ kind: 'function', functionId: 'steep', role: 'input' }] }),
  ].reduce((model, command) => command.apply(model), createModel({ rootId: 'root', rootLabel: 'Make Tea' }));
}

function apply(model: Model, plan: EntryPlan): Model {
  if (plan.kind === 'invalid') throw new Error(plan.reason);
  return plan.command.apply(model);
}

const boxes = [
  { id: 'a', rect: { x: 100, y: 100, width: 120, height: 60 } },
  { id: 'b', rect: { x: 260, y: 200, width: 120, height: 60 } },
];

describe('drop targets', () => {
  it('finds the box under a point, with an optional margin around it', () => {
    expect(boxAt(boxes, { x: 150, y: 130 })?.id).toBe('a');
    expect(boxAt(boxes, { x: 90, y: 130 })).toBeUndefined();
    expect(boxAt(boxes, { x: 90, y: 130 }, 12)?.id).toBe('a');
    expect(boxAt(boxes, { x: 500, y: 500 }, 12)).toBeUndefined();
    // Between two boxes whose margins overlap, the nearer one wins.
    expect(boxAt(boxes, { x: 236, y: 180 }, 40)?.id).toBe('a');
    expect(boxAt(boxes, { x: 250, y: 195 }, 40)?.id).toBe('b');
  });

  it('reads the side of the box as the role: left input, top control, bottom mechanism, never the right', () => {
    const rect = boxes[0]!.rect;
    expect(dropRole(rect, { x: 104, y: 130 })).toBe('input');
    expect(dropRole(rect, { x: 160, y: 104 })).toBe('control');
    expect(dropRole(rect, { x: 160, y: 156 })).toBe('mechanism');
    // The right edge is where outputs leave, so a drop there goes to the nearer of top and bottom.
    expect(dropRole(rect, { x: 218, y: 110 })).toBe('control');
    expect(dropRole(rect, { x: 218, y: 150 })).toBe('mechanism');
    // Just outside a side still means that side.
    expect(dropRole(rect, { x: 92, y: 130 })).toBe('input');
    expect(dropRole(rect, { x: 160, y: 92 })).toBe('control');
  });

  it('starts a new connection on the function and side it was dropped on', () => {
    const model = sample();
    const choices = otherEndChoices(model, 'boil', 'output');
    expect(droppedChoice(choices, { functionId: 'steep', role: 'control' })?.key).toBe('function:steep:control');
    // A side that is not on offer falls back to the function's first role.
    expect(droppedChoice(choices.filter((c) => c.key !== 'function:steep:control'), { functionId: 'steep', role: 'control' })?.key).toBe('function:steep:input');
    // Empty space means the boundary: the unconnected parent output first.
    expect(droppedChoice(choices, undefined)?.text).toBe('O1 Tea');
    expect(droppedChoice(choices, { functionId: 'boil', role: 'input' })).toBeUndefined();
    expect(droppedChoice([], undefined)).toBeUndefined();
  });
});

describe('dropping a parent arrow on a function', () => {
  it('carries an unconnected arrow into the diagram at that function, by the parent\'s role', () => {
    const model = sample();
    const next = apply(model, dropParentArrow(model, 'root', 'recipe', 'steep'));
    expect(arrowsOn(next, 'root').at(-1)).toMatchObject({ label: 'Recipe', targets: [{ kind: 'function', functionId: 'steep', role: 'control' }] });
    const made = apply(model, dropParentArrow(model, 'root', 'tea', 'pour'));
    expect(arrowsOn(made, 'root').at(-1)).toMatchObject({ label: 'Tea', sources: [{ kind: 'function', functionId: 'pour' }] });
  });

  it('branches a connected input to a further function, and joins a connected output from one', () => {
    let model = sample();
    const branch = dropParentArrow(model, 'root', 'water', 'steep');
    expect(branch.kind).toBe('branch');
    model = apply(model, branch);
    expect(getArrow(model, 'water-in').targets).toHaveLength(2);
    expect(arrowsOn(model, 'root')).toHaveLength(2);

    model = apply(model, dropParentArrow(model, 'root', 'tea', 'pour'));
    const join = dropParentArrow(model, 'root', 'tea', 'steep');
    expect(join.kind).toBe('join');
    model = apply(model, join);
    expect(arrowsOn(model, 'root').find((a) => a.label === 'Tea')!.sources).toHaveLength(2);
    expect(inheritedBoundary(model, 'root').every((p) => p.parentArrowId !== 'tea' || p.state === 'connected')).toBe(true);
  });

  it('says why a drop does nothing: already there, split, or not this diagram\'s arrow', () => {
    const model = sample();
    expect(dropParentArrow(model, 'root', 'water', 'boil')).toEqual({ kind: 'invalid', reason: '"Water" is already an input of this function' });
    expect(dropParentArrow(model, 'root', 'leaves', 'boil')).toMatchObject({ kind: 'invalid', reason: expect.stringContaining('split into parts') });
    expect(dropParentArrow(model, 'root', 'nope', 'boil').kind).toBe('invalid');
    const made = apply(model, dropParentArrow(model, 'root', 'tea', 'pour'));
    expect(dropParentArrow(made, 'root', 'tea', 'pour')).toEqual({ kind: 'invalid', reason: '"Tea" is already an output of this function' });
  });

  it('the workspace remembers which parent arrow is being dragged', () => {
    const state = workspaceReducer(createWorkspaceState(), { type: 'drag-parent-arrow', id: 'water' });
    expect(state.draggedParentArrow).toBe('water');
    expect(workspaceReducer(state, { type: 'drag-parent-arrow', id: 'water' })).toBe(state);
    expect(workspaceReducer(state, { type: 'drag-parent-arrow', id: undefined }).draggedParentArrow).toBeUndefined();
  });
});
