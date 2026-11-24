import { hasUnsavedChanges, canRedoEdit, canUndoEdit } from '../editor/editorState';
import type { Editor } from '../editor/useEditor';

export function Toolbar({ editor }: { editor: Editor }) {
  const { state, model } = editor;
  return (
    <header className="toolbar">
      <strong className="toolbar-title">IDEF0 Diagram Creator</strong>
      <span className="toolbar-model" title="The model's name; edit it under Model details">
        {model.info.name}
        {hasUnsavedChanges(state) ? ' •' : ''}
      </span>
      <span className="toolbar-gap" />
      <button onClick={editor.newModel}>New</button>
      <button onClick={() => void editor.openFile()} title="Open a model file (Ctrl+O)">Open…</button>
      <button onClick={editor.saveFile} title="Save the model as a JSON file (Ctrl+S)">Save</button>
      <button onClick={editor.loadExample} title="Load the change control reference model">Example</button>
      <span className="toolbar-divider" />
      <button onClick={() => editor.dispatch({ type: 'undo' })} disabled={!canUndoEdit(state)} title="Undo (Ctrl+Z)">Undo</button>
      <button onClick={() => editor.dispatch({ type: 'redo' })} disabled={!canRedoEdit(state)} title="Redo (Ctrl+Shift+Z)">Redo</button>
    </header>
  );
}
