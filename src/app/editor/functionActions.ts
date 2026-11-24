/**
 * The edits that several parts of the screen offer for a function or for the
 * selection (a button, a menu item, a key), each built once here as a domain
 * command plus where the screen should go afterwards.
 */
import {
  addFunction,
  batch,
  CONTEXT_DIAGRAM,
  deleteArrow,
  deleteFunction,
  getFunction,
  newFunctionId,
  renameFunction,
  updateInfo,
  type Command,
  type DiagramId,
  type FunctionId,
  type Model,
} from '../../domain';
import type { Selection } from './editorState';

/** A command, and the diagram and selection to show once it has run. */
export interface Step {
  readonly command: Command;
  readonly then: { readonly open?: DiagramId; readonly select?: Selection };
}

/** How many placeholder boxes a new decomposition starts with: the fewest IDEF0 allows on a child diagram. */
export const STARTING_BOXES = 3;

/** A new box on a diagram, selected for naming. On the context diagram that starts the decomposition of A0. */
export function addFunctionStep(model: Model, diagramId: DiagramId): Step {
  const parentId = diagramId === CONTEXT_DIAGRAM ? model.rootId : diagramId;
  const id = newFunctionId();
  return { command: addFunction({ parentId, id, label: 'Name This Function' }), then: { open: parentId, select: { kind: 'function', id } } };
}

/** Gives a function a child diagram of placeholder boxes and opens it. Undefined when it already has one. */
export function decomposeStep(model: Model, functionId: FunctionId): Step | undefined {
  if (getFunction(model, functionId).children.length > 0) return undefined;
  const ids = Array.from({ length: STARTING_BOXES }, () => newFunctionId());
  const commands = ids.map((id, i) => addFunction({ parentId: functionId, id, label: `Function ${i + 1}` }));
  return { command: batch('Decompose function', commands), then: { open: functionId, select: { kind: 'function', id: ids[0]! } } };
}

/** Renames a function. A model that is still named after its top function keeps following that function's name. */
export function renameFunctionCommand(model: Model, functionId: FunctionId, label: string): Command {
  const followsRoot = functionId === model.rootId && model.info.name === getFunction(model, functionId).label;
  const rename = renameFunction({ id: functionId, label });
  return followsRoot ? batch('Rename function', [rename, updateInfo({ name: label })]) : rename;
}

/** Deletes what is selected. Undefined when nothing that can be deleted is: no selection, the root, or a parent arrow. */
export function deleteSelectionCommand(model: Model, selection: Selection): Command | undefined {
  if (selection.kind === 'arrow') return deleteArrow({ id: selection.id });
  if (selection.kind === 'function' && selection.id !== model.rootId) return deleteFunction({ id: selection.id });
  return undefined;
}
