import { useEffect, useReducer, type Dispatch } from 'react';
import type { Model } from '../../domain';
import type { EditorState } from './editorState';
import { ancestors, branchOf } from './treeView';
import { createWorkspaceState, workspaceReducer, type WorkspaceAction, type WorkspaceState } from './workspaceState';

export interface Workspace {
  readonly state: WorkspaceState;
  readonly dispatch: Dispatch<WorkspaceAction>;
}

/** The screen's arrangement, kept in step with the editor: the tree always shows the open diagram's boxes and the selected function. */
export function useWorkspace(model: Model, editorState: EditorState): Workspace {
  const [state, dispatch] = useReducer(workspaceReducer, undefined, () => createWorkspaceState([model.rootId]));
  const { diagramId, selection } = editorState;
  const selectedFunction = selection.kind === 'function' ? selection.id : undefined;

  useEffect(() => {
    const ids = [model.rootId, ...branchOf(model, diagramId), ...(selectedFunction === undefined ? [] : ancestors(model, selectedFunction))];
    dispatch({ type: 'reveal', ids });
    // Only a move to another diagram, function or model reveals: `model` is left out so that an edit does not reopen what the user closed.
  }, [diagramId, selectedFunction, model.rootId]);

  return { state, dispatch };
}
