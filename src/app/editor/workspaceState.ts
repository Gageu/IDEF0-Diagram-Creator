/**
 * How the screen is arranged, as one immutable value with a reducer: which
 * view fills the centre, which panels are open, which tree branches are
 * expanded. None of it is part of the model, so none of it is saved or
 * undone; it sits beside `editorState`, which holds what the user is editing.
 */
import type { FunctionId, Role } from '../../domain';

export type WorkspaceView = 'diagram' | 'glossary';
export type GlossaryFilter = 'all' | 'undefined' | 'unused';

/** A field of the editor panel that an action elsewhere asks to put the cursor in. */
export type FocusField = 'label' | 'definition' | Role;

export interface WorkspaceState {
  readonly view: WorkspaceView;
  readonly glossaryFilter: GlossaryFilter;
  readonly violationsOpen: boolean;
  readonly treeOpen: boolean;
  readonly editorOpen: boolean;
  readonly expanded: ReadonlySet<FunctionId>;
  /** The field to focus once the editor panel shows the selection. Cleared when done. */
  readonly focus: FocusField | undefined;
  /** Goes up by one each time the diagram is asked to fit its pane. */
  readonly fitRequests: number;
}

export type WorkspaceAction =
  | { readonly type: 'show'; readonly view: WorkspaceView; readonly glossaryFilter?: GlossaryFilter }
  | { readonly type: 'filter-glossary'; readonly filter: GlossaryFilter }
  | { readonly type: 'toggle-panel'; readonly panel: 'violations' | 'tree' | 'editor' }
  | { readonly type: 'toggle-branch'; readonly id: FunctionId }
  /** Expands branches without closing any, so a function that was just opened or added is in view. */
  | { readonly type: 'reveal'; readonly ids: readonly FunctionId[] }
  | { readonly type: 'expand-only'; readonly ids: readonly FunctionId[] }
  | { readonly type: 'focus'; readonly field: FocusField }
  | { readonly type: 'focused' }
  | { readonly type: 'fit' };

export function createWorkspaceState(expanded: readonly FunctionId[] = []): WorkspaceState {
  return {
    view: 'diagram',
    glossaryFilter: 'all',
    violationsOpen: false,
    treeOpen: true,
    editorOpen: true,
    expanded: new Set(expanded),
    focus: undefined,
    fitRequests: 0,
  };
}

const PANEL_KEY = { violations: 'violationsOpen', tree: 'treeOpen', editor: 'editorOpen' } as const;

export function workspaceReducer(state: WorkspaceState, action: WorkspaceAction): WorkspaceState {
  switch (action.type) {
    case 'show':
      return { ...state, view: action.view, glossaryFilter: action.glossaryFilter ?? state.glossaryFilter };
    case 'filter-glossary':
      return { ...state, glossaryFilter: action.filter };
    case 'toggle-panel':
      return { ...state, [PANEL_KEY[action.panel]]: !state[PANEL_KEY[action.panel]] };
    case 'toggle-branch': {
      const expanded = new Set(state.expanded);
      if (!expanded.delete(action.id)) expanded.add(action.id);
      return { ...state, expanded };
    }
    case 'reveal':
      if (action.ids.every((id) => state.expanded.has(id))) return state;
      return { ...state, expanded: new Set([...state.expanded, ...action.ids]) };
    case 'expand-only':
      return { ...state, expanded: new Set(action.ids) };
    case 'focus':
      // The field lives in the editor panel beside the diagram, so both must be showing.
      return { ...state, focus: action.field, editorOpen: true, view: 'diagram' };
    case 'focused':
      return state.focus === undefined ? state : { ...state, focus: undefined };
    case 'fit':
      return { ...state, view: 'diagram', fitRequests: state.fitRequests + 1 };
  }
}
