import { useCallback, useEffect, useMemo, useReducer } from 'react';
import examplePack from '../../../examples/change_control_model.json?raw';
import { createModel, type Command, type DiagramId, type Model } from '../../domain';
import { importReferencePack, parseModel, serializeModel } from '../../persistence';
import type { Violation } from '../../validation';
import { checkModel } from '../composition';
import { createEditorState, currentModel, editorReducer, hasUnsavedChanges, type EditorAction, type EditorState, type Selection } from './editorState';
import { downloadText, fileNameFor, pickTextFile, readDraft, writeDraft } from './files';

export interface Editor {
  readonly state: EditorState;
  readonly model: Model;
  readonly violations: readonly Violation[];
  dispatch(action: EditorAction): void;
  /** Applies a command; optionally opens a diagram and selects something in the same step. */
  run(command: Command, then?: { select?: Selection; open?: DiagramId }): void;
  select(selection: Selection): void;
  open(diagramId: DiagramId, select?: Selection): void;
  newModel(): void;
  loadExample(): void;
  openFile(): Promise<void>;
  saveFile(): void;
}

function exampleModel(): Model {
  return importReferencePack(examplePack);
}

/** The model the app starts with: the work left in this browser, or the reference example. */
function initialModel(): Model {
  const draft = readDraft();
  if (draft !== undefined) {
    try {
      return parseModel(draft);
    } catch {
      // A draft from an older or broken build is not worth failing over.
    }
  }
  return exampleModel();
}

/** Reads a model file in the tool's own format, or the reference pack's format. */
function readModelFile(text: string): Model {
  try {
    return parseModel(text);
  } catch (ownFormatError) {
    try {
      return importReferencePack(text);
    } catch {
      throw ownFormatError;
    }
  }
}

/** The editor's state and every action the screen can take, as one object for the components. */
export function useEditor(): Editor {
  const [state, dispatch] = useReducer(editorReducer, undefined, () => createEditorState(initialModel()));
  const model = currentModel(state);
  const violations = useMemo(() => checkModel(model), [model]);
  const unsaved = hasUnsavedChanges(state);

  useEffect(() => writeDraft(serializeModel(model)), [model]);

  const confirmDiscard = useCallback(
    (): boolean => !unsaved || window.confirm('This replaces the current model. Changes since the last save will be lost. Continue?'),
    [unsaved],
  );

  return useMemo<Editor>(
    () => ({
      state,
      model,
      violations,
      dispatch,
      run: (command, then) => dispatch({ type: 'run', command, ...then }),
      select: (selection) => dispatch({ type: 'select', selection }),
      open: (diagramId, select) => dispatch({ type: 'open', diagramId, ...(select ? { select } : {}) }),
      newModel: () => {
        if (!confirmDiscard()) return;
        const fresh = createModel({ rootLabel: 'Name This Activity' });
        dispatch({ type: 'load', model: fresh });
        dispatch({ type: 'select', selection: { kind: 'function', id: fresh.rootId } });
      },
      loadExample: () => {
        if (confirmDiscard()) dispatch({ type: 'load', model: exampleModel() });
      },
      openFile: async () => {
        if (!confirmDiscard()) return;
        const text = await pickTextFile('.json,application/json');
        if (text === undefined) return;
        try {
          dispatch({ type: 'load', model: readModelFile(text) });
        } catch (error) {
          dispatch({ type: 'report', message: `That file could not be opened: ${error instanceof Error ? error.message : String(error)}` });
        }
      },
      saveFile: () => {
        downloadText(fileNameFor(model.info.name, 'json'), serializeModel(model), 'application/json');
        dispatch({ type: 'saved' });
      },
    }),
    [state, model, violations, confirmDiscard],
  );
}
