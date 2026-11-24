import { DomainError } from '../errors';
import { newId } from '../ids';
import { pruneDangling } from '../integrity';
import type { FunctionId, FunctionNode, Model } from '../model';
import { getFunction, parentOf } from '../queries';
import { defineCommand, moveItem, type Command } from './command';

function withFunction(model: Model, fn: FunctionNode): Model {
  return { ...model, functions: { ...model.functions, [fn.id]: fn } };
}

/** Adds a function under `parentId`. The first child starts the parent's decomposition. */
export function addFunction(args: { parentId: FunctionId; label: string; id?: FunctionId; index?: number }): Command {
  const id = args.id ?? newId('f');
  return defineCommand('Add function', (model) => {
    if (model.functions[id]) throw new DomainError(`Function "${id}" already exists`);
    const parent = getFunction(model, args.parentId);
    const children = [...parent.children];
    children.splice(args.index ?? children.length, 0, id);
    return withFunction(withFunction(model, { id, label: args.label, children: [] }), { ...parent, children });
  });
}

export function renameFunction(args: { id: FunctionId; label: string }): Command {
  return defineCommand('Rename function', (model) =>
    withFunction(model, { ...getFunction(model, args.id), label: args.label }),
  );
}

/** Moves a function to a new position among its siblings, which renumbers them. */
export function moveFunction(args: { id: FunctionId; toIndex: number }): Command {
  return defineCommand('Reorder function', (model) => {
    const parentId = parentOf(model, args.id);
    if (parentId === undefined) throw new DomainError('The root function cannot be reordered');
    const parent = getFunction(model, parentId);
    const children = moveItem(parent.children, parent.children.indexOf(args.id), args.toIndex);
    return withFunction(model, { ...parent, children });
  });
}

/** Deletes a function, its whole decomposition, and every arrow that depended on them. */
export function deleteFunction(args: { id: FunctionId }): Command {
  return defineCommand('Delete function', (model) => {
    const parentId = parentOf(model, args.id);
    if (parentId === undefined) throw new DomainError('The root function cannot be deleted');
    const doomed = new Set<FunctionId>();
    const collect = (id: FunctionId): void => {
      doomed.add(id);
      getFunction(model, id).children.forEach(collect);
    };
    collect(args.id);
    const parent = getFunction(model, parentId);
    const functions = Object.fromEntries(
      Object.entries(model.functions)
        .filter(([id]) => !doomed.has(id))
        .map(([id, fn]) => [id, id === parentId ? { ...parent, children: parent.children.filter((c) => c !== args.id) } : fn]),
    );
    return pruneDangling({ ...model, functions });
  });
}
