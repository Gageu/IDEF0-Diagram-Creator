import { CONTEXT_DIAGRAM, diagramNode, diagramOfFunction, inheritedBoundary, ROLES } from '../../domain';
import { parentArrowMenu } from '../editor/contextMenu';
import { ROLE_TITLE } from '../editor/describe';
import type { Screen } from '../useScreen';

/**
 * The arrows the open diagram receives from its parent box, grouped by side.
 * Each must be carried into the diagram, so the ones still unconnected stand
 * out. Each row can be dragged onto a function's box to connect it there,
 * or connected from its button.
 */
export function ParentArrows({ screen }: { screen: Screen }) {
  const { editor } = screen;
  const { model, state } = editor;
  if (state.diagramId === CONTEXT_DIAGRAM) return null;
  const inherited = inheritedBoundary(model, state.diagramId);
  const unconnected = inherited.filter((p) => p.state === 'unconnected').length;
  const selectedId = state.selection.kind === 'parent-arrow' ? state.selection.id : undefined;
  const parentNode = diagramNode(model, diagramOfFunction(model, state.diagramId));

  return (
    <section className="sidebar-section parent-arrows" aria-label="Parent arrows">
      <header className="section-header">
        <h2>Parent arrows</h2>
        <span className={`count ${unconnected > 0 ? 'is-error' : ''}`} title="Arrows that touch this diagram's box on the parent diagram">
          {unconnected > 0 ? `${unconnected} unconnected` : inherited.length}
        </span>
      </header>
      {inherited.length === 0 && <p className="empty">The box on {parentNode} has no arrows yet. Arrows added there appear here.</p>}
      {ROLES.map((role) => {
        const arrows = inherited.filter((p) => p.role === role);
        if (arrows.length === 0) return null;
        return (
          <div key={role} className="palette-group" data-role={role}>
            <h3>{ROLE_TITLE[role]}</h3>
            <ul>
              {arrows.map((p) => {
                const menu = () => parentArrowMenu(model, state.diagramId, p.parentArrowId);
                return (
                  <li
                    key={p.parentArrowId}
                    className={`palette-row is-${p.state} ${p.parentArrowId === selectedId ? 'is-selected' : ''}`}
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.setData('text/plain', p.label);
                      event.dataTransfer.effectAllowed = 'link';
                      screen.workspace.dispatch({ type: 'drag-parent-arrow', id: p.parentArrowId });
                    }}
                    onDragEnd={() => screen.workspace.dispatch({ type: 'drag-parent-arrow', id: undefined })}
                  >
                    <button
                      className="palette-main"
                      title={`${p.label || '(no label)'}: ${p.state} on this diagram. Drag it onto a function to connect it there.`}
                      onClick={() => editor.select({ kind: 'parent-arrow', id: p.parentArrowId })}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        editor.select({ kind: 'parent-arrow', id: p.parentArrowId });
                        screen.showMenu({ x: event.clientX, y: event.clientY }, `${p.code} ${p.label}`, menu());
                      }}
                    >
                      <span className="code-chip">{p.code}</span>
                      <span className="palette-label">{p.label || '(no label)'}</span>
                    </button>
                    {p.state === 'unconnected' ? (
                      <button className="small" onClick={(event) => screen.showMenu({ below: event.currentTarget.getBoundingClientRect(), align: 'end' }, `Connect ${p.code}`, menu())}>
                        Connect
                      </button>
                    ) : (
                      <span className="state-tag">{p.state}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
