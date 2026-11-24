import { useEffect, useRef, type KeyboardEvent, type MouseEvent } from 'react';
import { CONTEXT_DIAGRAM, diagramOfFunction, getFunction, type DiagramId } from '../../domain';
import { diagramMenu, functionMenu } from '../editor/contextMenu';
import { addFunctionStep, decomposeStep } from '../editor/functionActions';
import { expandableIds, treeMove, treeRows, type TreeRow } from '../editor/treeView';
import type { Screen } from '../useScreen';
import { Icon } from './Icon';

/**
 * The function tree. Clicking a decomposed function opens its child diagram;
 * clicking a leaf opens the diagram its box is on. Either way the function
 * is selected, so the editor panel shows it. Branches open and close, so a
 * deep model shows only the part being worked on.
 */
export function FunctionTree({ screen }: { screen: Screen }) {
  const { editor, workspace } = screen;
  const { model, state } = editor;
  const list = useRef<HTMLUListElement>(null);
  const rows = treeRows(model, workspace.state.expanded);
  const selectedId = state.selection.kind === 'function' ? state.selection.id : undefined;
  const selected = selectedId === undefined ? undefined : getFunction(model, selectedId);
  const decompose = selected ? decomposeStep(model, selected.id) : undefined;
  const expandable = expandableIds(model);
  const allExpanded = expandable.every((id) => workspace.state.expanded.has(id));

  // Keep the selected function's row in view when the selection comes from the diagram.
  useEffect(() => {
    if (selectedId !== undefined) list.current?.querySelector(`[data-row="${CSS.escape(selectedId)}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [selectedId, rows.length]);

  const choose = (id: DiagramId): void => {
    if (id === CONTEXT_DIAGRAM) return editor.open(CONTEXT_DIAGRAM);
    const decomposed = getFunction(model, id).children.length > 0;
    editor.open(decomposed ? id : diagramOfFunction(model, id), { kind: 'function', id });
  };
  const menuOf = (id: DiagramId) => (id === CONTEXT_DIAGRAM ? diagramMenu(model, CONTEXT_DIAGRAM) : functionMenu(model, id));

  const onContextMenu = (event: MouseEvent, row: TreeRow): void => {
    event.preventDefault();
    // A menu opened from the keyboard has no pointer position, so it hangs under the row.
    const anchor = event.clientX === 0 && event.clientY === 0 ? { below: event.currentTarget.getBoundingClientRect() } : { x: event.clientX, y: event.clientY };
    screen.showMenu(anchor, `${row.number} ${row.label}`, menuOf(row.id));
  };

  const onKeyDown = (event: KeyboardEvent, row: TreeRow): void => {
    if (event.target !== event.currentTarget) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      return choose(row.id);
    }
    const move = treeMove(model, rows, row.id, event.key);
    if (!move) return;
    event.preventDefault();
    if (move.kind === 'focus') list.current?.querySelector<HTMLElement>(`[data-row="${CSS.escape(move.id)}"]`)?.focus();
    else workspace.dispatch({ type: 'toggle-branch', id: move.id });
  };

  // One row takes Tab; the arrow keys move between rows from there.
  const tabStop = rows.some((r) => r.id === selectedId) ? selectedId : rows.some((r) => r.id === state.diagramId) ? state.diagramId : CONTEXT_DIAGRAM;

  return (
    <nav className="sidebar-section tree" aria-label="Function tree">
      <header className="section-header">
        <h2>Functions</h2>
        <button className="ghost icon-button small" onClick={() => screen.act({ type: 'run', ...addFunctionStep(model, state.diagramId) })} aria-label="Add function" title="Add a function to the open diagram (F)">
          <Icon name="plus" />
        </button>
        <button className="ghost icon-button small" onClick={() => decompose && screen.act({ type: 'run', ...decompose })} disabled={!decompose} aria-label="Decompose" title="Give the selected function a child diagram">
          <Icon name="decompose" />
        </button>
        <button
          className="ghost icon-button small"
          disabled={expandable.length === 0}
          onClick={() => workspace.dispatch({ type: 'expand-only', ids: allExpanded ? [] : expandable })}
          aria-label={allExpanded ? 'Collapse all' : 'Expand all'}
          title={allExpanded ? 'Collapse every branch' : 'Expand every branch'}
        >
          <Icon name={allExpanded ? 'collapse' : 'expand'} />
        </button>
      </header>
      <ul className="tree-list" role="tree" ref={list}>
        {rows.map((row) => {
          const classes = ['tree-row', row.id === selectedId ? 'is-selected' : '', row.id === state.diagramId ? 'is-open' : ''].join(' ');
          return (
            <li
              key={row.id}
              role="treeitem"
              data-row={row.id}
              className={classes}
              style={{ paddingLeft: 6 + row.depth * 14 }}
              tabIndex={row.id === tabStop ? 0 : -1}
              aria-level={row.depth + 1}
              aria-selected={row.id === selectedId}
              aria-expanded={row.decomposed ? row.expanded : undefined}
              aria-current={row.id === state.diagramId ? 'page' : undefined}
              title={row.id === CONTEXT_DIAGRAM ? 'Open the context diagram' : row.decomposed ? 'Open this function’s diagram' : 'Show this function'}
              onClick={() => choose(row.id)}
              onContextMenu={(event) => onContextMenu(event, row)}
              onKeyDown={(event) => onKeyDown(event, row)}
            >
              {row.decomposed ? (
                <button
                  className="tree-toggle"
                  tabIndex={-1}
                  aria-label={row.expanded ? `Collapse ${row.number}` : `Expand ${row.number}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    workspace.dispatch({ type: 'toggle-branch', id: row.id });
                  }}
                >
                  <Icon name={row.expanded ? 'chevron-down' : 'chevron-right'} size={14} />
                </button>
              ) : (
                <span className="tree-toggle" />
              )}
              <span className="tree-number">{row.number}</span>
              <span className="tree-label">{row.label || '(no name)'}</span>
              <button
                className="tree-more"
                tabIndex={-1}
                aria-label={`Actions for ${row.number}`}
                title="Actions"
                onClick={(event) => {
                  event.stopPropagation();
                  screen.showMenu({ below: event.currentTarget.getBoundingClientRect(), align: 'end' }, `${row.number} ${row.label}`, menuOf(row.id));
                }}
              >
                <Icon name="more" size={14} />
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
