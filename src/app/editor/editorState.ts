/**
 * Everything the editor screen shows, as one immutable value with a reducer.
 * It holds no IDEF0 rules: the model changes only through domain commands,
 * and this file adds what a screen needs around that: which diagram is open,
 * what is selected, and the last message to show.
 */
import {
  canRedo,
  canUndo,
  CONTEXT_DIAGRAM,
  createHistory,
  diagramExists,
  DomainError,
  execute,
  parentOf,
  redo,
  undo,
  type ArrowId,
  type Command,
  type DiagramId,
  type FunctionId,
  type History,
  type Model,
} from '../../domain';

export type Selection =
  | { readonly kind: 'none' }
  | { readonly kind: 'function'; readonly id: FunctionId }
  | { readonly kind: 'arrow'; readonly id: ArrowId }
  /** An arrow on the parent diagram, picked from the inherited list or its dashed stub. */
  | { readonly kind: 'parent-arrow'; readonly id: ArrowId };

export const NO_SELECTION: Selection = { kind: 'none' };

export interface EditorState {
  readonly history: History;
  readonly diagramId: DiagramId;
  readonly selection: Selection;
  /** Why the last action could not be done, until the next action. */
  readonly message: string | undefined;
  /** The model as last saved or opened, to tell whether there are unsaved changes. */
  readonly saved: Model;
}

export type EditorAction =
  | { readonly type: 'run'; readonly command: Command; readonly select?: Selection; readonly open?: DiagramId }
  | { readonly type: 'undo' }
  | { readonly type: 'redo' }
  | { readonly type: 'open'; readonly diagramId: DiagramId; readonly select?: Selection }
  | { readonly type: 'select'; readonly selection: Selection }
  | { readonly type: 'load'; readonly model: Model }
  | { readonly type: 'saved' }
  | { readonly type: 'report'; readonly message: string }
  | { readonly type: 'dismiss' };

export function createEditorState(model: Model): EditorState {
  return { history: createHistory(model), diagramId: CONTEXT_DIAGRAM, selection: NO_SELECTION, message: undefined, saved: model };
}

export const currentModel = (state: EditorState): Model => state.history.present;
export const hasUnsavedChanges = (state: EditorState): boolean => state.history.present !== state.saved;
export const canUndoEdit = (state: EditorState): boolean => canUndo(state.history);
export const canRedoEdit = (state: EditorState): boolean => canRedo(state.history);

/** The nearest diagram that still exists: the one asked for, or the closest one above it in the old tree. */
function nearestDiagram(before: Model, after: Model, diagramId: DiagramId): DiagramId {
  let current: DiagramId | undefined = diagramId;
  while (current !== undefined && current !== CONTEXT_DIAGRAM) {
    if (diagramExists(after, current)) return current;
    current = before.functions[current] ? parentOf(before, current) : undefined;
  }
  return CONTEXT_DIAGRAM;
}

function selectionExists(model: Model, selection: Selection): boolean {
  if (selection.kind === 'none') return true;
  if (selection.kind === 'function') return model.functions[selection.id] !== undefined;
  return model.arrows.some((a) => a.id === selection.id);
}

/** After the model changed under the screen, keep the open diagram and selection pointing at things that exist. */
function settle(state: EditorState, before: Model): EditorState {
  const model = currentModel(state);
  return {
    ...state,
    diagramId: nearestDiagram(before, model, state.diagramId),
    selection: selectionExists(model, state.selection) ? state.selection : NO_SELECTION,
  };
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  const before = currentModel(state);
  switch (action.type) {
    case 'run':
      try {
        const history = execute(state.history, action.command);
        return settle({ ...state, history, message: undefined, diagramId: action.open ?? state.diagramId, selection: action.select ?? state.selection }, before);
      } catch (error) {
        // An invalid edit leaves everything as it was and says why.
        if (error instanceof DomainError) return { ...state, message: error.message };
        throw error;
      }
    case 'undo':
      return settle({ ...state, history: undo(state.history), message: undefined }, before);
    case 'redo':
      return settle({ ...state, history: redo(state.history), message: undefined }, before);
    case 'open':
      if (!diagramExists(before, action.diagramId)) return state;
      return { ...state, diagramId: action.diagramId, selection: action.select ?? NO_SELECTION, message: undefined };
    case 'select':
      return selectionExists(before, action.selection) ? { ...state, selection: action.selection } : state;
    case 'load':
      return createEditorState(action.model);
    case 'saved':
      return { ...state, saved: before };
    case 'report':
      return { ...state, message: action.message };
    case 'dismiss':
      return { ...state, message: undefined };
  }
}
