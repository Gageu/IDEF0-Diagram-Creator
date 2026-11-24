import { addFunction, batch, CONTEXT_DIAGRAM, diagramOfFunction, getFunction, newFunctionId, nodeNumber, type FunctionId } from '../../domain';
import type { Editor } from '../editor/useEditor';

/** How many placeholder boxes a new decomposition starts with: the fewest IDEF0 allows on a child diagram. */
const STARTING_BOXES = 3;

/**
 * The function tree. Clicking a decomposed function opens its child diagram;
 * clicking a leaf opens the diagram its box is on. Either way the function
 * is selected, so the editor on the right shows it.
 */
export function FunctionTree({ editor }: { editor: Editor }) {
  const { model, state } = editor;
  const selectedId = state.selection.kind === 'function' ? state.selection.id : undefined;
  const selected = selectedId === undefined ? undefined : getFunction(model, selectedId);

  const choose = (id: FunctionId): void => {
    const decomposed = getFunction(model, id).children.length > 0;
    editor.open(decomposed ? id : diagramOfFunction(model, id), { kind: 'function', id });
  };

  /** A new box on the open diagram; on the context diagram that starts the decomposition of A0. */
  const addBox = (): void => {
    const parentId = state.diagramId === CONTEXT_DIAGRAM ? model.rootId : state.diagramId;
    const id = newFunctionId();
    editor.run(addFunction({ parentId, id, label: 'Name This Function' }), { open: parentId, select: { kind: 'function', id } });
  };

  const decompose = (): void => {
    if (!selected) return;
    const ids = Array.from({ length: STARTING_BOXES }, newFunctionId);
    const commands = ids.map((id, i) => addFunction({ parentId: selected.id, id, label: `Function ${i + 1}` }));
    editor.run(batch('Decompose function', commands), { open: selected.id, select: { kind: 'function', id: ids[0]! } });
  };

  const node = (id: FunctionId) => {
    const fn = getFunction(model, id);
    const classes = ['tree-row', id === selectedId ? 'is-selected' : '', id === state.diagramId ? 'is-open' : ''].join(' ');
    return (
      <li key={id}>
        <button className={classes} onClick={() => choose(id)} title={fn.children.length > 0 ? 'Open this function\'s diagram' : 'Show this function'}>
          <span className="tree-number">{nodeNumber(model, id)}</span>
          <span>{fn.label || '(no name)'}</span>
        </button>
        {fn.children.length > 0 && <ul>{fn.children.map(node)}</ul>}
      </li>
    );
  };

  return (
    <nav className="pane tree" aria-label="Function tree">
      <h2>Functions</h2>
      <div className="button-row">
        <button onClick={addBox} title="Add a box to the open diagram (F)" data-shortcut="f">Add function</button>
        <button onClick={decompose} disabled={!selected || selected.children.length > 0} title="Give the selected function a child diagram">Decompose</button>
      </div>
      <ul className="tree-list">
        <li>
          <button className={`tree-row ${state.diagramId === CONTEXT_DIAGRAM ? 'is-open' : ''}`} onClick={() => editor.open(CONTEXT_DIAGRAM)}>
            <span className="tree-number">A-0</span>
            <span>Context diagram</span>
          </button>
        </li>
        {node(model.rootId)}
      </ul>
    </nav>
  );
}
